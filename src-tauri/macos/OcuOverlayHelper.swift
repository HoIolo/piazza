import AppKit
import ApplicationServices
import CoreImage
import CoreMedia
import Foundation
import ImageIO
import QuartzCore
import ScreenCaptureKit
import UniformTypeIdentifiers

// MARK: - JSONL 输出（串行写 stdout，防止多路流交错）

private let stdoutQueue = DispatchQueue(label: "com.piazza.ocu-helper.stdout")

private func emitJSON(_ object: [String: Any]) {
    stdoutQueue.async {
        guard JSONSerialization.isValidJSONObject(object),
              let data = try? JSONSerialization.data(withJSONObject: object, options: []) else {
            return
        }
        var line = data
        line.append(0x0A)
        FileHandle.standardOutput.write(line)
    }
}

private func quartzToAppKitFrame(_ qBounds: CGRect) -> NSRect {
    let primaryHeight = CGDisplayBounds(CGMainDisplayID()).height
    let appKitY = primaryHeight - qBounds.origin.y - qBounds.height
    return NSRect(x: qBounds.origin.x, y: appKitY, width: qBounds.width, height: qBounds.height)
}

private func appIconBase64(pid: pid_t) -> String? {
    guard let app = NSRunningApplication(processIdentifier: pid),
          let icon = app.icon else {
        return nil
    }
    let size = NSSize(width: 32, height: 32)
    let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: Int(size.width),
        pixelsHigh: Int(size.height),
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    )
    guard let rep else { return nil }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    icon.draw(in: NSRect(origin: .zero, size: size), from: .zero, operation: .copy, fraction: 1.0)
    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])?.base64EncodedString()
}

// MARK: - 悬浮边框面板（不拦截鼠标，轻量标示被控窗口）

private final class BorderView: NSView {
    var active: Bool = true {
        didSet { needsDisplay = true }
    }

    override func draw(_ dirtyRect: NSRect) {
        NSColor.clear.setFill()
        dirtyRect.fill()
        let insetRect = bounds.insetBy(dx: 1.5, dy: 1.5)
        let path = NSBezierPath(roundedRect: insetRect, xRadius: 11, yRadius: 11)
        path.lineWidth = active ? 2.0 : 1.2
        let color = active
            ? NSColor.systemBlue.withAlphaComponent(0.75)
            : NSColor.systemBlue.withAlphaComponent(0.28)
        color.setStroke()
        path.stroke()
    }
}

private final class BorderPanel: NSPanel {
    private let borderView = BorderView()

    init() {
        super.init(
            contentRect: NSRect(x: 0, y: 0, width: 100, height: 100),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        isFloatingPanel = true
        hidesOnDeactivate = false
        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        ignoresMouseEvents = true
        level = .floating
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
        borderView.autoresizingMask = [.width, .height]
        contentView = borderView
    }

    func update(frame: NSRect, active: Bool) {
        borderView.active = active
        setFrame(frame, display: true)
        if !isVisible {
            orderFrontRegardless()
        }
    }
}

// MARK: - 左上角悬浮控制与录屏捕获角标

private final class BadgePanel: NSPanel {
    private let windowId: CGWindowID
    private let onStop: (CGWindowID) -> Void
    private let effectView = NSVisualEffectView()
    private let dotView = NSImageView()
    private let labelField = NSTextField(labelWithString: "")
    private let stopButton = NSButton()
    private var isPulseActive = false

    init(windowId: CGWindowID, onStop: @escaping (CGWindowID) -> Void) {
        self.windowId = windowId
        self.onStop = onStop
        super.init(
            contentRect: NSRect(x: 0, y: 0, width: 176, height: 26),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        isFloatingPanel = true
        becomesKeyOnlyIfNeeded = true
        hidesOnDeactivate = false
        isOpaque = false
        backgroundColor = .clear
        hasShadow = true
        level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.floatingWindow)) + 1)
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]

        effectView.material = .hudWindow
        effectView.state = .active
        effectView.blendingMode = .withinWindow
        effectView.appearance = NSAppearance(named: .darkAqua)
        effectView.wantsLayer = true
        effectView.layer?.cornerRadius = 13
        effectView.layer?.masksToBounds = true
        effectView.layer?.borderWidth = 0.75
        effectView.layer?.borderColor = NSColor.white.withAlphaComponent(0.22).cgColor
        contentView = effectView

        let dotConfig = NSImage.SymbolConfiguration(pointSize: 11, weight: .semibold)
        dotView.image = NSImage(systemSymbolName: "record.circle.fill", accessibilityDescription: "屏幕捕获中")?
            .withSymbolConfiguration(dotConfig)
        dotView.contentTintColor = .systemRed
        dotView.wantsLayer = true

        labelField.font = NSFont.systemFont(ofSize: 11, weight: .medium)
        labelField.textColor = .white
        labelField.lineBreakMode = .byTruncatingTail
        labelField.maximumNumberOfLines = 1

        let stopConfig = NSImage.SymbolConfiguration(pointSize: 12, weight: .medium)
        stopButton.image = NSImage(systemSymbolName: "stop.circle.fill", accessibilityDescription: "停止控制")?
            .withSymbolConfiguration(stopConfig)
        stopButton.isBordered = false
        stopButton.contentTintColor = NSColor.white.withAlphaComponent(0.82)
        stopButton.toolTip = "停止控制"
        stopButton.target = self
        stopButton.action = #selector(handleStopClicked)

        effectView.addSubview(dotView)
        effectView.addSubview(labelField)
        effectView.addSubview(stopButton)
    }

    @objc private func handleStopClicked() {
        onStop(windowId)
    }

    func update(windowFrame: NSRect, text: String, active: Bool) {
        labelField.stringValue = text
        labelField.sizeToFit()

        let textWidth = min(max(labelField.frame.width, 72), 160)
        let badgeWidth = textWidth + 54
        let badgeHeight: CGFloat = 26

        dotView.contentTintColor = active ? .systemRed : .systemGreen
        updatePulse(active: active)

        effectView.frame = NSRect(x: 0, y: 0, width: badgeWidth, height: badgeHeight)
        dotView.frame = NSRect(x: 9, y: 6, width: 14, height: 14)
        labelField.frame = NSRect(x: 27, y: 5, width: textWidth, height: 16)
        stopButton.frame = NSRect(x: badgeWidth - 23, y: 4, width: 18, height: 18)

        let screen = NSScreen.screens.first(where: {
            $0.frame.intersects(windowFrame)
        }) ?? NSScreen.main ?? NSScreen.screens.first

        let visibleMaxY = screen?.visibleFrame.maxY ?? windowFrame.maxY + 40
        let desiredAboveY = windowFrame.maxY + 4
        let origin: NSPoint
        if desiredAboveY + badgeHeight <= visibleMaxY {
            origin = NSPoint(x: windowFrame.minX + 6, y: desiredAboveY)
        } else {
            // 窗口顶边贴近菜单栏或全屏时，放在红绿灯右侧避免遮挡原生关闭按钮
            origin = NSPoint(x: windowFrame.minX + 78, y: windowFrame.maxY - badgeHeight - 7)
        }

        setFrame(NSRect(origin: origin, size: NSSize(width: badgeWidth, height: badgeHeight)), display: true)
        if !isVisible {
            orderFrontRegardless()
        }
    }

    private func updatePulse(active: Bool) {
        if active == isPulseActive { return }
        isPulseActive = active
        dotView.layer?.removeAnimation(forKey: "pulse")
        if active {
            let anim = CABasicAnimation(keyPath: "opacity")
            anim.fromValue = 1.0
            anim.toValue = 0.35
            anim.duration = 0.75
            anim.autoreverses = true
            anim.repeatCount = .infinity
            dotView.layer?.add(anim, forKey: "pulse")
        } else {
            dotView.layer?.opacity = 1.0
        }
    }
}

// MARK: - 单窗口 ScreenCaptureKit 流与状态管理

private final class WatchedWindow: NSObject, SCStreamOutput, SCStreamDelegate {
    let windowId: CGWindowID
    var pid: pid_t
    var appName: String
    var title: String
    var label: String
    var active: Bool
    var lastFrameAt: CFAbsoluteTime = 0
    var stream: SCStream?
    let badgePanel: BadgePanel
    let borderPanel: BorderPanel

    private let ciContext = CIContext(options: [.useSoftwareRenderer: false])
    private let captureQueue = DispatchQueue(label: "com.piazza.ocu-helper.capture")
    private var encodingBusy = false

    init(
        windowId: CGWindowID,
        pid: pid_t,
        appName: String,
        title: String,
        label: String,
        active: Bool,
        onStop: @escaping (CGWindowID) -> Void
    ) {
        self.windowId = windowId
        self.pid = pid
        self.appName = appName
        self.title = title
        self.label = label
        self.active = active
        self.badgePanel = BadgePanel(windowId: windowId, onStop: onStop)
        self.borderPanel = BorderPanel()
        super.init()
    }

    func startStream(scWindow: SCWindow) {
        guard stream == nil else { return }
        let filter = SCContentFilter(desktopIndependentWindow: scWindow)
        let config = SCStreamConfiguration()
        let rawW = max(Double(scWindow.frame.width), 160.0)
        let rawH = max(Double(scWindow.frame.height), 120.0)
        let maxW = 520.0
        let scale = min(1.0, maxW / rawW)
        let outW = max(160, Int((rawW * scale).rounded()) & ~1)
        let outH = max(100, Int((rawH * scale).rounded()) & ~1)

        config.width = outW
        config.height = outH
        config.minimumFrameInterval = CMTime(value: 1, timescale: 8)
        config.queueDepth = 3
        config.pixelFormat = kCVPixelFormatType_32BGRA
        config.showsCursor = false
        config.scalesToFit = true

        let scStream = SCStream(filter: filter, configuration: config, delegate: self)
        do {
            try scStream.addStreamOutput(self, type: .screen, sampleHandlerQueue: captureQueue)
            scStream.startCapture { [weak self] error in
                guard let self else { return }
                if let error {
                    emitJSON([
                        "type": "stream_error",
                        "windowId": Int(self.windowId),
                        "error": error.localizedDescription,
                    ])
                }
            }
            self.stream = scStream
            if #available(macOS 14.0, *) {
                SCScreenshotManager.captureImage(contentFilter: filter, configuration: config) { [weak self] cgImage, _ in
                    guard let self, let cgImage else { return }
                    self.captureQueue.async {
                        guard self.lastFrameAt == 0 else { return }
                        self.lastFrameAt = CFAbsoluteTimeGetCurrent()
                        self.emitCIImage(CIImage(cgImage: cgImage), width: cgImage.width, height: cgImage.height)
                    }
                }
            }
        } catch {
            emitJSON([
                "type": "stream_error",
                "windowId": Int(windowId),
                "error": error.localizedDescription,
            ])
        }
    }

    func stop() {
        if let scStream = stream {
            stream = nil
            scStream.stopCapture { _ in }
        }
        badgePanel.orderOut(nil)
        badgePanel.close()
        borderPanel.orderOut(nil)
        borderPanel.close()
    }

    func updateOverlays(quartzBounds: CGRect, onScreen: Bool) {
        if !onScreen || quartzBounds.width < 20 || quartzBounds.height < 20 {
            badgePanel.orderOut(nil)
            borderPanel.orderOut(nil)
            return
        }
        let appKitFrame = quartzToAppKitFrame(quartzBounds)
        let prefix = active ? (label.isEmpty ? "Piazza 控制中" : label) : "Piazza 已连接"
        let displayText = "\(appName) · \(prefix)"
        borderPanel.update(frame: appKitFrame, active: active)
        badgePanel.update(windowFrame: appKitFrame, text: displayText, active: active)
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        emitJSON([
            "type": "stream_error",
            "windowId": Int(windowId),
            "error": error.localizedDescription,
        ])
    }

    func stream(
        _ stream: SCStream,
        didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
        of type: SCStreamOutputType
    ) {
        guard type == .screen, sampleBuffer.isValid else { return }
        if let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false)
            as? [[SCStreamFrameInfo: Any]],
           let statusRaw = attachments.first?[.status] as? Int,
           let status = SCFrameStatus(rawValue: statusRaw),
           status != .complete {
            return
        }
        let now = CFAbsoluteTimeGetCurrent()
        guard !encodingBusy, now - lastFrameAt >= 0.11 else { return }
        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }

        encodingBusy = true
        lastFrameAt = now
        let width = CVPixelBufferGetWidth(pixelBuffer)
        let height = CVPixelBufferGetHeight(pixelBuffer)
        emitCIImage(CIImage(cvPixelBuffer: pixelBuffer), width: width, height: height)
        encodingBusy = false
    }

    private func emitCIImage(_ ciImage: CIImage, width: Int, height: Int) {
        let srgb = CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB()
        let options: [CIImageRepresentationOption: Any] = [
            CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String): 0.62
        ]
        if let jpegData = ciContext.jpegRepresentation(of: ciImage, colorSpace: srgb, options: options) {
            emitJSON([
                "type": "frame",
                "windowId": Int(windowId),
                "width": width,
                "height": height,
                "jpeg": jpegData.base64EncodedString(),
            ])
        }
    }
}

// MARK: - 协调中心（主线程运行）

private final class OverlayCoordinator {
    private var watched: [CGWindowID: WatchedWindow] = [:]
    private var pollTimer: Timer?
    private let ownPid = ProcessInfo.processInfo.processIdentifier

    func handleCommand(_ cmd: [String: Any]) {
        let name = cmd["cmd"] as? String ?? ""
        switch name {
        case "check_permissions":
            emitPermissions()
        case "request_permission":
            let kind = cmd["kind"] as? String ?? ""
            requestPermission(kind: kind)
        case "watch":
            let appName = (cmd["appName"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let reqWid = (cmd["windowId"] as? NSNumber).map { CGWindowID($0.uint32Value) }
            let label = cmd["label"] as? String ?? ""
            let active = cmd["active"] as? Bool ?? true
            watchWindow(appName: appName, requestedWindowId: reqWid, label: label, active: active)
        case "set_active":
            let reqWid = (cmd["windowId"] as? NSNumber).map { CGWindowID($0.uint32Value) }
            let active = cmd["active"] as? Bool ?? false
            let label = cmd["label"] as? String
            setActive(windowId: reqWid, active: active, label: label)
        case "focus":
            if let num = cmd["windowId"] as? NSNumber {
                focusWindow(windowId: CGWindowID(num.uint32Value))
            }
        case "unwatch":
            if let num = cmd["windowId"] as? NSNumber {
                unwatch(windowId: CGWindowID(num.uint32Value))
            }
        case "clear":
            clearAll()
        default:
            break
        }
    }

    func shutdown() {
        clearAll()
    }

    private func emitPermissions() {
        emitJSON([
            "type": "permissions",
            "accessibility": AXIsProcessTrusted(),
            "screenRecording": CGPreflightScreenCaptureAccess(),
        ])
    }

    private func requestPermission(kind: String) {
        if kind == "accessibility" {
            let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
            _ = AXIsProcessTrustedWithOptions([key: true] as CFDictionary)
            if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") {
                NSWorkspace.shared.open(url)
            }
        } else if kind == "screen_recording" {
            _ = CGRequestScreenCaptureAccess()
            if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture") {
                NSWorkspace.shared.open(url)
            }
        }
        emitPermissions()
    }

    private func watchWindow(
        appName: String,
        requestedWindowId: CGWindowID?,
        label: String,
        active: Bool
    ) {
        SCShareableContent.getExcludingDesktopWindows(true, onScreenWindowsOnly: false) { [weak self] content, error in
            DispatchQueue.main.async {
                guard let self else { return }
                if let content,
                   let match = self.pickSCWindow(content.windows, appName: appName, windowId: requestedWindowId) {
                    let wid = match.windowID
                    let resolvedApp = match.owningApplication?.applicationName ?? (appName.isEmpty ? "App" : appName)
                    let pid = match.owningApplication?.processID ?? 0
                    let title = match.title ?? ""
                    let item = self.ensureWatched(
                        windowId: wid,
                        pid: pid,
                        requestedApp: appName,
                        appName: resolvedApp,
                        title: title,
                        label: label,
                        active: active,
                        bounds: match.frame
                    )
                    item.startStream(scWindow: match)
                    item.updateOverlays(quartzBounds: match.frame, onScreen: match.isOnScreen)
                    return
                }

                // 未授权录屏或 SCShareableContent 不可用时，回退到 CGWindowList 挂载左上角角标
                if let cgMatch = self.pickCGWindow(appName: appName, windowId: requestedWindowId) {
                    let item = self.ensureWatched(
                        windowId: cgMatch.windowId,
                        pid: cgMatch.pid,
                        requestedApp: appName,
                        appName: cgMatch.appName,
                        title: cgMatch.title,
                        label: label,
                        active: active,
                        bounds: cgMatch.bounds
                    )
                    if let error {
                        emitJSON([
                            "type": "stream_error",
                            "windowId": Int(cgMatch.windowId),
                            "error": error.localizedDescription,
                        ])
                    }
                    item.updateOverlays(quartzBounds: cgMatch.bounds, onScreen: cgMatch.onScreen)
                }
            }
        }
    }

    private func ensureWatched(
        windowId: CGWindowID,
        pid: pid_t,
        requestedApp: String,
        appName: String,
        title: String,
        label: String,
        active: Bool,
        bounds: CGRect
    ) -> WatchedWindow {
        let item: WatchedWindow
        if let existing = watched[windowId] {
            existing.pid = pid
            existing.appName = appName
            if !title.isEmpty { existing.title = title }
            existing.label = label
            existing.active = active
            item = existing
        } else {
            item = WatchedWindow(
                windowId: windowId,
                pid: pid,
                appName: appName,
                title: title,
                label: label,
                active: active
            ) { [weak self] wid in
                self?.unwatch(windowId: wid)
                emitJSON(["type": "badge_stop", "windowId": Int(wid)])
            }
            watched[windowId] = item
            ensurePollTimer()
        }

        var payload: [String: Any] = [
            "type": "window_info",
            "windowId": Int(windowId),
            "requestedApp": requestedApp,
            "appName": appName,
            "title": item.title,
            "pid": Int(pid),
            "bounds": [
                "x": bounds.origin.x,
                "y": bounds.origin.y,
                "width": bounds.width,
                "height": bounds.height,
            ],
        ]
        if let icon = appIconBase64(pid: pid) {
            payload["appIcon"] = icon
        }
        emitJSON(payload)
        return item
    }

    private func pickSCWindow(_ windows: [SCWindow], appName: String, windowId: CGWindowID?) -> SCWindow? {
        if let windowId {
            if let exact = windows.first(where: { $0.windowID == windowId && $0.owningApplication?.processID != ownPid }) {
                return exact
            }
        }
        guard !appName.isEmpty else { return nil }
        let target = appName.lowercased()
        let candidates = windows.filter { w in
            guard w.owningApplication?.processID != ownPid,
                  w.windowLayer == 0,
                  w.frame.width >= 60,
                  w.frame.height >= 60 else {
                return false
            }
            let owner = (w.owningApplication?.applicationName ?? "").lowercased()
            let bundle = (w.owningApplication?.bundleIdentifier ?? "").lowercased()
            return owner == target || bundle == target || owner.contains(target) || target.contains(owner)
        }
        return candidates.max { lhs, rhs in
            if lhs.isOnScreen != rhs.isOnScreen { return !lhs.isOnScreen && rhs.isOnScreen }
            return (lhs.frame.width * lhs.frame.height) < (rhs.frame.width * rhs.frame.height)
        }
    }

    private struct CGWindowMatch {
        let windowId: CGWindowID
        let pid: pid_t
        let appName: String
        let title: String
        let bounds: CGRect
        let onScreen: Bool
    }

    private func pickCGWindow(appName: String, windowId: CGWindowID?) -> CGWindowMatch? {
        guard let list = CGWindowListCopyWindowInfo([.optionAll, .excludeDesktopElements], kCGNullWindowID)
            as? [[String: Any]] else {
            return nil
        }
        let target = appName.lowercased()
        var candidates: [CGWindowMatch] = []
        for entry in list {
            guard let num = entry[kCGWindowNumber as String] as? UInt32,
                  let pid = entry[kCGWindowOwnerPID as String] as? pid_t,
                  pid != ownPid else {
                continue
            }
            let layer = entry[kCGWindowLayer as String] as? Int ?? 0
            guard let boundsDict = entry[kCGWindowBounds as String] as? NSDictionary,
                  let bounds = CGRect(dictionaryRepresentation: boundsDict) else {
                continue
            }
            let owner = entry[kCGWindowOwnerName as String] as? String ?? ""
            let title = entry[kCGWindowName as String] as? String ?? ""
            let onScreen = (entry[kCGWindowIsOnscreen as String] as? Bool) ?? false
            let match = CGWindowMatch(
                windowId: num,
                pid: pid,
                appName: owner.isEmpty ? appName : owner,
                title: title,
                bounds: bounds,
                onScreen: onScreen
            )
            if let windowId, num == windowId {
                return match
            }
            if layer == 0, bounds.width >= 60, bounds.height >= 60, !target.isEmpty {
                let low = owner.lowercased()
                if low == target || low.contains(target) || target.contains(low) {
                    candidates.append(match)
                }
            }
        }
        return candidates.max { lhs, rhs in
            if lhs.onScreen != rhs.onScreen { return !lhs.onScreen && rhs.onScreen }
            return (lhs.bounds.width * lhs.bounds.height) < (rhs.bounds.width * rhs.bounds.height)
        }
    }

    private func setActive(windowId: CGWindowID?, active: Bool, label: String?) {
        for (wid, item) in watched {
            if let windowId, wid != windowId { continue }
            item.active = active
            if let label { item.label = label }
        }
        pollWindowBounds()
    }

    private func focusWindow(windowId: CGWindowID) {
        guard let item = watched[windowId] else { return }
        NSRunningApplication(processIdentifier: item.pid)?.activate(options: [.activateIgnoringOtherApps])
    }

    private func unwatch(windowId: CGWindowID) {
        guard let item = watched.removeValue(forKey: windowId) else { return }
        item.stop()
        stopTimerIfEmpty()
    }

    private func clearAll() {
        for (_, item) in watched {
            item.stop()
        }
        watched.removeAll()
        stopTimerIfEmpty()
    }

    private func ensurePollTimer() {
        guard pollTimer == nil else { return }
        pollTimer = Timer.scheduledTimer(withTimeInterval: 0.08, repeats: true) { [weak self] _ in
            self?.pollWindowBounds()
        }
    }

    private func stopTimerIfEmpty() {
        if watched.isEmpty {
            pollTimer?.invalidate()
            pollTimer = nil
        }
    }

    private func pollWindowBounds() {
        guard !watched.isEmpty else { return }
        guard let list = CGWindowListCopyWindowInfo([.optionAll, .excludeDesktopElements], kCGNullWindowID)
            as? [[String: Any]] else {
            return
        }
        var byId: [CGWindowID: [String: Any]] = [:]
        for entry in list {
            if let num = entry[kCGWindowNumber as String] as? UInt32 {
                byId[num] = entry
            }
        }

        var closed: [CGWindowID] = []
        for (wid, item) in watched {
            guard let entry = byId[wid] else {
                closed.append(wid)
                continue
            }
            let onScreen = (entry[kCGWindowIsOnscreen as String] as? Bool) ?? false
            if let boundsDict = entry[kCGWindowBounds as String] as? NSDictionary,
               let bounds = CGRect(dictionaryRepresentation: boundsDict) {
                item.updateOverlays(quartzBounds: bounds, onScreen: onScreen)
            } else {
                item.updateOverlays(quartzBounds: .zero, onScreen: false)
            }
        }
        for wid in closed {
            watched.removeValue(forKey: wid)?.stop()
            emitJSON(["type": "window_closed", "windowId": Int(wid)])
        }
        stopTimerIfEmpty()
    }
}

// MARK: - 入口与 stdin 命令循环

private let app = NSApplication.shared
app.setActivationPolicy(.accessory)

private let coordinator = OverlayCoordinator()

DispatchQueue.global(qos: .userInitiated).async {
    while let line = readLine(strippingNewline: true) {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { continue }
        guard let data = trimmed.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            continue
        }
        DispatchQueue.main.async {
            coordinator.handleCommand(json)
        }
    }
    DispatchQueue.main.async {
        coordinator.shutdown()
        app.terminate(nil)
        exit(0)
    }
}

app.run()
