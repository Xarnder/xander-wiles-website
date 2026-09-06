
// this file is generated — do not edit it


/// <reference types="@sveltejs/kit" />

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are limited to _private_ access.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * **_Private_ access:**
 * 
 * - This module cannot be imported into client-side code
 * - This module only includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 * 
 * For example, given the following build time environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/private';
 * 
 * console.log(ENVIRONMENT); // => "production"
 * console.log(PUBLIC_BASE_URL); // => throws error during build
 * ```
 * 
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/private' {
	export const SVELTEKIT_FORK: string;
	export const VITE_FIREBASE_MESSAGING_SENDER_ID: string;
	export const USE_STAGING_OAUTH: string;
	export const npm_config_prefix: string;
	export const CLAUDE_CODE_MESSAGING_SOCKET: string;
	export const VITE_FIREBASE_API_KEY: string;
	export const CLAUDECODE: string;
	export const HUSKY: string;
	export const OSLogRateLimit: string;
	export const CLAUDE_CODE_SESSION_ID: string;
	export const CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH: string;
	export const npm_config_user_agent: string;
	export const NODE_ENV: string;
	export const COREPACK_ENABLE_AUTO_PIN: string;
	export const npm_config_cache: string;
	export const DISABLE_AUTOUPDATER: string;
	export const npm_node_execpath: string;
	export const MCP_SERVER_CONNECTION_BATCH_SIZE: string;
	export const DISABLE_MICROCOMPACT: string;
	export const LOGNAME: string;
	export const INIT_CWD: string;
	export const HOME: string;
	export const SHLVL: string;
	export const SUPABASE_URL: string;
	export const npm_config_npm_version: string;
	export const XPC_SERVICE_NAME: string;
	export const npm_config_node_gyp: string;
	export const SUPABASE_PUBLISHABLE_KEY: string;
	export const PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: string;
	export const CLAUDE_PID: string;
	export const EDITOR: string;
	export const npm_lifecycle_event: string;
	export const npm_config_globalconfig: string;
	export const XPC_FLAGS: string;
	export const npm_command: string;
	export const _: string;
	export const npm_lifecycle_script: string;
	export const npm_package_json: string;
	export const USE_LOCAL_OAUTH: string;
	export const npm_config_userconfig: string;
	export const PATH: string;
	export const CLAUDE_CODE_EAGER_FLUSH: string;
	export const CLAUDE_CODE_REPORT_FINDINGS: string;
	export const CLAUDE_CODE_MESSAGING_TOKEN: string;
	export const npm_execpath: string;
	export const CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES: string;
	export const npm_config_init_module: string;
	export const __CF_USER_TEXT_ENCODING: string;
	export const MCP_CONNECTION_NONBLOCKING: string;
	export const SSH_AUTH_SOCK: string;
	export const COMMAND_MODE: string;
	export const npm_package_version: string;
	export const CLAUDE_CODE_CHILD_SESSION: string;
	export const npm_package_name: string;
	export const CLAUDE_CODE_DISABLE_TERMINAL_TITLE: string;
	export const GEMINI_API_KEY: string;
	export const CLAUDE_PREVIEW_CLASSIFIER_FLOOR: string;
	export const AI_AGENT: string;
	export const CLAUDE_AGENT_SDK_VERSION: string;
	export const __CFBundleIdentifier: string;
	export const USER: string;
	export const CLAUDE_CODE_ENABLE_ASK_USER_QUESTION_TOOL: string;
	export const GIT_EDITOR: string;
	export const CLAUDE_CODE_SDK_HAS_OAUTH_REFRESH: string;
	export const npm_config_noproxy: string;
	export const SHELL: string;
	export const CLAUDE_CODE_DISABLE_CRON: string;
	export const npm_config_local_prefix: string;
	export const TMPDIR: string;
	export const MallocNanoZone: string;
	export const PWD: string;
	export const BAGGAGE: string;
	export const GOOGLE_APPLICATION_CREDENTIALS: string;
	export const NoDefaultCurrentDirectoryInExePath: string;
	export const npm_config_global_prefix: string;
	export const VITE_FIREBASE_STORAGE_BUCKET: string;
	export const VITE_FIREBASE_AUTH_DOMAIN: string;
	export const CLAUDE_CODE_ENTRYPOINT: string;
	export const COLOR: string;
	export const API_TIMEOUT_MS: string;
	export const CLAUDE_CODE_OAUTH_SCOPES: string;
	export const NODE: string;
	export const CLAUDE_CODE_EXECPATH: string;
	export const NODE_USE_SYSTEM_CA: string;
	export const VITE_FIREBASE_APP_ID: string;
	export const CLAUDE_EFFORT: string;
	export const VITE_FIREBASE_PROJECT_ID: string;
	export const ANTHROPIC_BASE_URL: string;
	export const CLAUDE_CODE_HOST_SESSION_ID: string;
}

/**
 * This module provides access to environment variables that are injected _statically_ into your bundle at build time and are _publicly_ accessible.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Static environment variables are [loaded by Vite](https://vitejs.dev/guide/env-and-mode.html#env-files) from `.env` files and `process.env` at build time and then statically injected into your bundle at build time, enabling optimisations like dead code elimination.
 * 
 * **_Public_ access:**
 * 
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 * 
 * For example, given the following build time environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { ENVIRONMENT, PUBLIC_BASE_URL } from '$env/static/public';
 * 
 * console.log(ENVIRONMENT); // => throws error during build
 * console.log(PUBLIC_BASE_URL); // => "http://site.com"
 * ```
 * 
 * The above values will be the same _even if_ different values for `ENVIRONMENT` or `PUBLIC_BASE_URL` are set at runtime, as they are statically replaced in your code with their build time values.
 */
declare module '$env/static/public' {
	export const PUBLIC_HOME_DESIGN_FIREBASE_PROJECT_ID: string;
	export const PUBLIC_TIME_PASS_FIREBASE_MESSAGING_SENDER_ID: string;
	export const PUBLIC_PROMPT_FIREBASE_AUTH_DOMAIN: string;
	export const PUBLIC_TIME_PASS_FIREBASE_STORAGE_BUCKET: string;
	export const PUBLIC_WORK_FIREBASE_AUTH_DOMAIN: string;
	export const PUBLIC_STORY_FIREBASE_AUTH_DOMAIN: string;
	export const PUBLIC_HOME_DESIGN_FIREBASE_MESSAGING_SENDER_ID: string;
	export const PUBLIC_HOME_DESIGN_FIREBASE_APP_ID: string;
	export const PUBLIC_HOME_DESIGN_FIREBASE_AUTH_DOMAIN: string;
	export const PUBLIC_STORY_FIREBASE_APP_ID: string;
	export const PUBLIC_SOCIAL_FIREBASE_STORAGE_BUCKET: string;
	export const PUBLIC_WORK_FIREBASE_API_KEY: string;
	export const PUBLIC_STORY_FIREBASE_API_KEY: string;
	export const PUBLIC_MARKDOWN_EDITOR_GOOGLE_CLIENT_ID: string;
	export const PUBLIC_ROUTINE_FIREBASE_STORAGE_BUCKET: string;
	export const PUBLIC_ROUTINE_FIREBASE_MESSAGING_SENDER_ID: string;
	export const PUBLIC_STORY_FIREBASE_PROJECT_ID: string;
	export const PUBLIC_STORY_FIREBASE_STORAGE_BUCKET: string;
	export const PUBLIC_PROMPT_FIREBASE_MESSAGING_SENDER_ID: string;
	export const PUBLIC_TODO_FIREBASE_API_KEY: string;
	export const PUBLIC_HOME_DESIGN_FIREBASE_STORAGE_BUCKET: string;
	export const PUBLIC_SOCIAL_FIREBASE_PROJECT_ID: string;
	export const PUBLIC_ROUTINE_FIREBASE_AUTH_DOMAIN: string;
	export const PUBLIC_ROUTINE_FIREBASE_APP_ID: string;
	export const PUBLIC_TODO_FIREBASE_APP_ID: string;
	export const PUBLIC_SOCIAL_FIREBASE_APP_ID: string;
	export const PUBLIC_WORK_FIREBASE_STORAGE_BUCKET: string;
	export const PUBLIC_PROMPT_FIREBASE_API_KEY: string;
	export const PUBLIC_PROMPT_FIREBASE_PROJECT_ID: string;
	export const PUBLIC_TODO_FIREBASE_AUTH_DOMAIN: string;
	export const PUBLIC_PROMPT_FIREBASE_APP_ID: string;
	export const PUBLIC_SOCIAL_FIREBASE_AUTH_DOMAIN: string;
	export const PUBLIC_TODO_FIREBASE_MESSAGING_SENDER_ID: string;
	export const PUBLIC_STORY_FIREBASE_MESSAGING_SENDER_ID: string;
	export const PUBLIC_WORK_FIREBASE_PROJECT_ID: string;
	export const PUBLIC_WORK_FIREBASE_APP_ID: string;
	export const PUBLIC_PROMPT_FIREBASE_STORAGE_BUCKET: string;
	export const PUBLIC_TIME_PASS_FIREBASE_AUTH_DOMAIN: string;
	export const PUBLIC_ROUTINE_FIREBASE_API_KEY: string;
	export const PUBLIC_TIME_PASS_FIREBASE_APP_ID: string;
	export const PUBLIC_ROUTINE_FIREBASE_PROJECT_ID: string;
	export const PUBLIC_YOUTUBE_API_KEY: string;
	export const PUBLIC_WORK_FIREBASE_MESSAGING_SENDER_ID: string;
	export const PUBLIC_TODO_FIREBASE_STORAGE_BUCKET: string;
	export const PUBLIC_HOME_DESIGN_FIREBASE_API_KEY: string;
	export const PUBLIC_SOCIAL_FIREBASE_MESSAGING_SENDER_ID: string;
	export const PUBLIC_TIME_PASS_FIREBASE_API_KEY: string;
	export const PUBLIC_SOCIAL_FIREBASE_API_KEY: string;
	export const PUBLIC_TIME_PASS_FIREBASE_PROJECT_ID: string;
	export const PUBLIC_TODO_FIREBASE_PROJECT_ID: string;
}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are limited to _private_ access.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 * 
 * **_Private_ access:**
 * 
 * - This module cannot be imported into client-side code
 * - This module includes variables that _do not_ begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) _and do_ start with [`config.kit.env.privatePrefix`](https://svelte.dev/docs/kit/configuration#env) (if configured)
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 * 
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 * 
 * For example, given the following runtime environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://site.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { env } from '$env/dynamic/private';
 * 
 * console.log(env.ENVIRONMENT); // => "production"
 * console.log(env.PUBLIC_BASE_URL); // => undefined
 * ```
 */
declare module '$env/dynamic/private' {
	export const env: {
		SVELTEKIT_FORK: string;
		VITE_FIREBASE_MESSAGING_SENDER_ID: string;
		USE_STAGING_OAUTH: string;
		npm_config_prefix: string;
		CLAUDE_CODE_MESSAGING_SOCKET: string;
		VITE_FIREBASE_API_KEY: string;
		CLAUDECODE: string;
		HUSKY: string;
		OSLogRateLimit: string;
		CLAUDE_CODE_SESSION_ID: string;
		CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH: string;
		npm_config_user_agent: string;
		NODE_ENV: string;
		COREPACK_ENABLE_AUTO_PIN: string;
		npm_config_cache: string;
		DISABLE_AUTOUPDATER: string;
		npm_node_execpath: string;
		MCP_SERVER_CONNECTION_BATCH_SIZE: string;
		DISABLE_MICROCOMPACT: string;
		LOGNAME: string;
		INIT_CWD: string;
		HOME: string;
		SHLVL: string;
		SUPABASE_URL: string;
		npm_config_npm_version: string;
		XPC_SERVICE_NAME: string;
		npm_config_node_gyp: string;
		SUPABASE_PUBLISHABLE_KEY: string;
		PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: string;
		CLAUDE_PID: string;
		EDITOR: string;
		npm_lifecycle_event: string;
		npm_config_globalconfig: string;
		XPC_FLAGS: string;
		npm_command: string;
		_: string;
		npm_lifecycle_script: string;
		npm_package_json: string;
		USE_LOCAL_OAUTH: string;
		npm_config_userconfig: string;
		PATH: string;
		CLAUDE_CODE_EAGER_FLUSH: string;
		CLAUDE_CODE_REPORT_FINDINGS: string;
		CLAUDE_CODE_MESSAGING_TOKEN: string;
		npm_execpath: string;
		CLAUDE_CODE_EMIT_TOOL_USE_SUMMARIES: string;
		npm_config_init_module: string;
		__CF_USER_TEXT_ENCODING: string;
		MCP_CONNECTION_NONBLOCKING: string;
		SSH_AUTH_SOCK: string;
		COMMAND_MODE: string;
		npm_package_version: string;
		CLAUDE_CODE_CHILD_SESSION: string;
		npm_package_name: string;
		CLAUDE_CODE_DISABLE_TERMINAL_TITLE: string;
		GEMINI_API_KEY: string;
		CLAUDE_PREVIEW_CLASSIFIER_FLOOR: string;
		AI_AGENT: string;
		CLAUDE_AGENT_SDK_VERSION: string;
		__CFBundleIdentifier: string;
		USER: string;
		CLAUDE_CODE_ENABLE_ASK_USER_QUESTION_TOOL: string;
		GIT_EDITOR: string;
		CLAUDE_CODE_SDK_HAS_OAUTH_REFRESH: string;
		npm_config_noproxy: string;
		SHELL: string;
		CLAUDE_CODE_DISABLE_CRON: string;
		npm_config_local_prefix: string;
		TMPDIR: string;
		MallocNanoZone: string;
		PWD: string;
		BAGGAGE: string;
		GOOGLE_APPLICATION_CREDENTIALS: string;
		NoDefaultCurrentDirectoryInExePath: string;
		npm_config_global_prefix: string;
		VITE_FIREBASE_STORAGE_BUCKET: string;
		VITE_FIREBASE_AUTH_DOMAIN: string;
		CLAUDE_CODE_ENTRYPOINT: string;
		COLOR: string;
		API_TIMEOUT_MS: string;
		CLAUDE_CODE_OAUTH_SCOPES: string;
		NODE: string;
		CLAUDE_CODE_EXECPATH: string;
		NODE_USE_SYSTEM_CA: string;
		VITE_FIREBASE_APP_ID: string;
		CLAUDE_EFFORT: string;
		VITE_FIREBASE_PROJECT_ID: string;
		ANTHROPIC_BASE_URL: string;
		CLAUDE_CODE_HOST_SESSION_ID: string;
		[key: `PUBLIC_${string}`]: undefined;
		[key: `${string}`]: string | undefined;
	}
}

/**
 * This module provides access to environment variables set _dynamically_ at runtime and that are _publicly_ accessible.
 * 
 * |         | Runtime                                                                    | Build time                                                               |
 * | ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
 * | Private | [`$env/dynamic/private`](https://svelte.dev/docs/kit/$env-dynamic-private) | [`$env/static/private`](https://svelte.dev/docs/kit/$env-static-private) |
 * | Public  | [`$env/dynamic/public`](https://svelte.dev/docs/kit/$env-dynamic-public)   | [`$env/static/public`](https://svelte.dev/docs/kit/$env-static-public)   |
 * 
 * Dynamic environment variables are defined by the platform you're running on. For example if you're using [`adapter-node`](https://github.com/sveltejs/kit/tree/main/packages/adapter-node) (or running [`vite preview`](https://svelte.dev/docs/kit/cli)), this is equivalent to `process.env`.
 * 
 * **_Public_ access:**
 * 
 * - This module _can_ be imported into client-side code
 * - **Only** variables that begin with [`config.kit.env.publicPrefix`](https://svelte.dev/docs/kit/configuration#env) (which defaults to `PUBLIC_`) are included
 * 
 * > [!NOTE] In `dev`, `$env/dynamic` includes environment variables from `.env`. In `prod`, this behavior will depend on your adapter.
 * 
 * > [!NOTE] To get correct types, environment variables referenced in your code should be declared (for example in an `.env` file), even if they don't have a value until the app is deployed:
 * >
 * > ```env
 * > MY_FEATURE_FLAG=
 * > ```
 * >
 * > You can override `.env` values from the command line like so:
 * >
 * > ```sh
 * > MY_FEATURE_FLAG="enabled" npm run dev
 * > ```
 * 
 * For example, given the following runtime environment:
 * 
 * ```env
 * ENVIRONMENT=production
 * PUBLIC_BASE_URL=http://example.com
 * ```
 * 
 * With the default `publicPrefix` and `privatePrefix`:
 * 
 * ```ts
 * import { env } from '$env/dynamic/public';
 * console.log(env.ENVIRONMENT); // => undefined, not public
 * console.log(env.PUBLIC_BASE_URL); // => "http://example.com"
 * ```
 * 
 * ```
 * 
 * ```
 */
declare module '$env/dynamic/public' {
	export const env: {
		PUBLIC_HOME_DESIGN_FIREBASE_PROJECT_ID: string;
		PUBLIC_TIME_PASS_FIREBASE_MESSAGING_SENDER_ID: string;
		PUBLIC_PROMPT_FIREBASE_AUTH_DOMAIN: string;
		PUBLIC_TIME_PASS_FIREBASE_STORAGE_BUCKET: string;
		PUBLIC_WORK_FIREBASE_AUTH_DOMAIN: string;
		PUBLIC_STORY_FIREBASE_AUTH_DOMAIN: string;
		PUBLIC_HOME_DESIGN_FIREBASE_MESSAGING_SENDER_ID: string;
		PUBLIC_HOME_DESIGN_FIREBASE_APP_ID: string;
		PUBLIC_HOME_DESIGN_FIREBASE_AUTH_DOMAIN: string;
		PUBLIC_STORY_FIREBASE_APP_ID: string;
		PUBLIC_SOCIAL_FIREBASE_STORAGE_BUCKET: string;
		PUBLIC_WORK_FIREBASE_API_KEY: string;
		PUBLIC_STORY_FIREBASE_API_KEY: string;
		PUBLIC_MARKDOWN_EDITOR_GOOGLE_CLIENT_ID: string;
		PUBLIC_ROUTINE_FIREBASE_STORAGE_BUCKET: string;
		PUBLIC_ROUTINE_FIREBASE_MESSAGING_SENDER_ID: string;
		PUBLIC_STORY_FIREBASE_PROJECT_ID: string;
		PUBLIC_STORY_FIREBASE_STORAGE_BUCKET: string;
		PUBLIC_PROMPT_FIREBASE_MESSAGING_SENDER_ID: string;
		PUBLIC_TODO_FIREBASE_API_KEY: string;
		PUBLIC_HOME_DESIGN_FIREBASE_STORAGE_BUCKET: string;
		PUBLIC_SOCIAL_FIREBASE_PROJECT_ID: string;
		PUBLIC_ROUTINE_FIREBASE_AUTH_DOMAIN: string;
		PUBLIC_ROUTINE_FIREBASE_APP_ID: string;
		PUBLIC_TODO_FIREBASE_APP_ID: string;
		PUBLIC_SOCIAL_FIREBASE_APP_ID: string;
		PUBLIC_WORK_FIREBASE_STORAGE_BUCKET: string;
		PUBLIC_PROMPT_FIREBASE_API_KEY: string;
		PUBLIC_PROMPT_FIREBASE_PROJECT_ID: string;
		PUBLIC_TODO_FIREBASE_AUTH_DOMAIN: string;
		PUBLIC_PROMPT_FIREBASE_APP_ID: string;
		PUBLIC_SOCIAL_FIREBASE_AUTH_DOMAIN: string;
		PUBLIC_TODO_FIREBASE_MESSAGING_SENDER_ID: string;
		PUBLIC_STORY_FIREBASE_MESSAGING_SENDER_ID: string;
		PUBLIC_WORK_FIREBASE_PROJECT_ID: string;
		PUBLIC_WORK_FIREBASE_APP_ID: string;
		PUBLIC_PROMPT_FIREBASE_STORAGE_BUCKET: string;
		PUBLIC_TIME_PASS_FIREBASE_AUTH_DOMAIN: string;
		PUBLIC_ROUTINE_FIREBASE_API_KEY: string;
		PUBLIC_TIME_PASS_FIREBASE_APP_ID: string;
		PUBLIC_ROUTINE_FIREBASE_PROJECT_ID: string;
		PUBLIC_YOUTUBE_API_KEY: string;
		PUBLIC_WORK_FIREBASE_MESSAGING_SENDER_ID: string;
		PUBLIC_TODO_FIREBASE_STORAGE_BUCKET: string;
		PUBLIC_HOME_DESIGN_FIREBASE_API_KEY: string;
		PUBLIC_SOCIAL_FIREBASE_MESSAGING_SENDER_ID: string;
		PUBLIC_TIME_PASS_FIREBASE_API_KEY: string;
		PUBLIC_SOCIAL_FIREBASE_API_KEY: string;
		PUBLIC_TIME_PASS_FIREBASE_PROJECT_ID: string;
		PUBLIC_TODO_FIREBASE_PROJECT_ID: string;
		[key: `PUBLIC_${string}`]: string | undefined;
	}
}
