import { PiRpcClient } from './client'

export type AuthMethod = 'oauth' | 'api_key'

export interface AccountProvider {
  id: string
  name: string
  stored?: AuthMethod
  methods: Array<{ type: AuthMethod; label: string; subscription?: boolean }>
}

export type AccountNotice =
  | { type: 'auth_url'; url: string; instructions?: string }
  | { type: 'device_code'; userCode: string; verificationUri: string }
  | { type: 'info'; message: string; links?: Array<{ url: string; label?: string }> }
  | { type: 'progress'; message: string }

export type AccountPrompt = { message: string } & (
  | { type: 'text' | 'secret' | 'manual_code'; placeholder?: string }
  | { type: 'select'; options: Array<{ id: string; label: string; description?: string }> }
)

type AccountEvent =
  | { type: 'account_notice'; notice: AccountNotice }
  | { type: 'account_prompt'; id: string; prompt: AccountPrompt }
  | { type: 'account_prompt_closed'; id: string }

type AccountCommand =
  | { type: 'list_accounts' }
  | { type: 'account_login'; provider: string; method: AuthMethod }
  | { type: 'account_logout'; provider: string }

export const accountsRpc = new PiRpcClient<AccountEvent, AccountCommand>(
  { prefix: 'pi-accounts', accounts: true, side: false },
  15 * 60_000,
)
