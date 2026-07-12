
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
	export const NODE_ENV: string;
	export const VITE_FIREBASE_MESSAGING_SENDER_ID: string;
	export const VITE_FIREBASE_API_KEY: string;
	export const COLORTERM: string;
	export const npm_config_prefix: string;
	export const npm_node_execpath: string;
	export const OSLogRateLimit: string;
	export const VSCODE_GIT_IPC_HANDLE: string;
	export const npm_package_json: string;
	export const npm_lifecycle_script: string;
	export const VSCODE_GIT_ASKPASS_NODE: string;
	export const SHLVL: string;
	export const GEMINI_API_KEY: string;
	export const VSCODE_INJECTION: string;
	export const XPC_SERVICE_NAME: string;
	export const GIT_ASKPASS: string;
	export const npm_config_node_gyp: string;
	export const SUPABASE_PUBLISHABLE_KEY: string;
	export const SUPABASE_URL: string;
	export const npm_config_npm_version: string;
	export const LANG: string;
	export const EDITOR: string;
	export const VSCODE_GIT_ASKPASS_EXTRA_ARGS: string;
	export const npm_lifecycle_event: string;
	export const LOGNAME: string;
	export const npm_config_globalconfig: string;
	export const XPC_FLAGS: string;
	export const npm_command: string;
	export const npm_config_noproxy: string;
	export const USER_ZDOTDIR: string;
	export const _: string;
	export const npm_config_userconfig: string;
	export const PATH: string;
	export const npm_execpath: string;
	export const npm_config_init_module: string;
	export const __CF_USER_TEXT_ENCODING: string;
	export const VSCODE_PROFILE_INITIALIZED: string;
	export const SSH_AUTH_SOCK: string;
	export const COMMAND_MODE: string;
	export const VITE_FIREBASE_STORAGE_BUCKET: string;
	export const VITE_FIREBASE_APP_ID: string;
	export const __CFBundleIdentifier: string;
	export const USER: string;
	export const npm_package_name: string;
	export const ZDOTDIR: string;
	export const SHELL: string;
	export const COLOR: string;
	export const VSCODE_PYTHON_AUTOACTIVATE_GUARD: string;
	export const GOOGLE_APPLICATION_CREDENTIALS: string;
	export const npm_config_global_prefix: string;
	export const TERM: string;
	export const MallocNanoZone: string;
	export const TMPDIR: string;
	export const VSCODE_GIT_IPC_AUTH_TOKEN: string;
	export const INIT_CWD: string;
	export const VITE_FIREBASE_AUTH_DOMAIN: string;
	export const npm_config_user_agent: string;
	export const VITE_FIREBASE_PROJECT_ID: string;
	export const npm_config_local_prefix: string;
	export const HOME: string;
	export const TERM_PROGRAM: string;
	export const PWD: string;
	export const NODE: string;
	export const npm_config_cache: string;
	export const TERM_PROGRAM_VERSION: string;
	export const VSCODE_GIT_ASKPASS_MAIN: string;
	export const npm_package_version: string;
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
	export const PUBLIC_PROMPT_FIREBASE_AUTH_DOMAIN: string;
	export const PUBLIC_WORK_FIREBASE_APP_ID: string;
	export const PUBLIC_SOCIAL_FIREBASE_STORAGE_BUCKET: string;
	export const PUBLIC_STORY_FIREBASE_APP_ID: string;
	export const PUBLIC_STORY_FIREBASE_API_KEY: string;
	export const PUBLIC_HOME_DESIGN_FIREBASE_API_KEY: string;
	export const PUBLIC_HOME_DESIGN_FIREBASE_APP_ID: string;
	export const PUBLIC_HOME_DESIGN_FIREBASE_AUTH_DOMAIN: string;
	export const PUBLIC_STORY_FIREBASE_AUTH_DOMAIN: string;
	export const PUBLIC_STORY_FIREBASE_PROJECT_ID: string;
	export const PUBLIC_SOCIAL_FIREBASE_API_KEY: string;
	export const PUBLIC_STORY_FIREBASE_STORAGE_BUCKET: string;
	export const PUBLIC_PROMPT_FIREBASE_MESSAGING_SENDER_ID: string;
	export const PUBLIC_TODO_FIREBASE_API_KEY: string;
	export const PUBLIC_HOME_DESIGN_FIREBASE_STORAGE_BUCKET: string;
	export const PUBLIC_TODO_FIREBASE_MESSAGING_SENDER_ID: string;
	export const PUBLIC_SOCIAL_FIREBASE_AUTH_DOMAIN: string;
	export const PUBLIC_SOCIAL_FIREBASE_PROJECT_ID: string;
	export const PUBLIC_WORK_FIREBASE_API_KEY: string;
	export const PUBLIC_TODO_FIREBASE_APP_ID: string;
	export const PUBLIC_WORK_FIREBASE_STORAGE_BUCKET: string;
	export const PUBLIC_PROMPT_FIREBASE_API_KEY: string;
	export const PUBLIC_PROMPT_FIREBASE_PROJECT_ID: string;
	export const PUBLIC_TODO_FIREBASE_AUTH_DOMAIN: string;
	export const PUBLIC_PROMPT_FIREBASE_APP_ID: string;
	export const PUBLIC_WORK_FIREBASE_MESSAGING_SENDER_ID: string;
	export const PUBLIC_YOUTUBE_API_KEY: string;
	export const PUBLIC_WORK_FIREBASE_PROJECT_ID: string;
	export const PUBLIC_SOCIAL_FIREBASE_MESSAGING_SENDER_ID: string;
	export const PUBLIC_HOME_DESIGN_FIREBASE_MESSAGING_SENDER_ID: string;
	export const PUBLIC_PROMPT_FIREBASE_STORAGE_BUCKET: string;
	export const PUBLIC_SOCIAL_FIREBASE_APP_ID: string;
	export const PUBLIC_WORK_FIREBASE_AUTH_DOMAIN: string;
	export const PUBLIC_TODO_FIREBASE_STORAGE_BUCKET: string;
	export const PUBLIC_STORY_FIREBASE_MESSAGING_SENDER_ID: string;
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
		NODE_ENV: string;
		VITE_FIREBASE_MESSAGING_SENDER_ID: string;
		VITE_FIREBASE_API_KEY: string;
		COLORTERM: string;
		npm_config_prefix: string;
		npm_node_execpath: string;
		OSLogRateLimit: string;
		VSCODE_GIT_IPC_HANDLE: string;
		npm_package_json: string;
		npm_lifecycle_script: string;
		VSCODE_GIT_ASKPASS_NODE: string;
		SHLVL: string;
		GEMINI_API_KEY: string;
		VSCODE_INJECTION: string;
		XPC_SERVICE_NAME: string;
		GIT_ASKPASS: string;
		npm_config_node_gyp: string;
		SUPABASE_PUBLISHABLE_KEY: string;
		SUPABASE_URL: string;
		npm_config_npm_version: string;
		LANG: string;
		EDITOR: string;
		VSCODE_GIT_ASKPASS_EXTRA_ARGS: string;
		npm_lifecycle_event: string;
		LOGNAME: string;
		npm_config_globalconfig: string;
		XPC_FLAGS: string;
		npm_command: string;
		npm_config_noproxy: string;
		USER_ZDOTDIR: string;
		_: string;
		npm_config_userconfig: string;
		PATH: string;
		npm_execpath: string;
		npm_config_init_module: string;
		__CF_USER_TEXT_ENCODING: string;
		VSCODE_PROFILE_INITIALIZED: string;
		SSH_AUTH_SOCK: string;
		COMMAND_MODE: string;
		VITE_FIREBASE_STORAGE_BUCKET: string;
		VITE_FIREBASE_APP_ID: string;
		__CFBundleIdentifier: string;
		USER: string;
		npm_package_name: string;
		ZDOTDIR: string;
		SHELL: string;
		COLOR: string;
		VSCODE_PYTHON_AUTOACTIVATE_GUARD: string;
		GOOGLE_APPLICATION_CREDENTIALS: string;
		npm_config_global_prefix: string;
		TERM: string;
		MallocNanoZone: string;
		TMPDIR: string;
		VSCODE_GIT_IPC_AUTH_TOKEN: string;
		INIT_CWD: string;
		VITE_FIREBASE_AUTH_DOMAIN: string;
		npm_config_user_agent: string;
		VITE_FIREBASE_PROJECT_ID: string;
		npm_config_local_prefix: string;
		HOME: string;
		TERM_PROGRAM: string;
		PWD: string;
		NODE: string;
		npm_config_cache: string;
		TERM_PROGRAM_VERSION: string;
		VSCODE_GIT_ASKPASS_MAIN: string;
		npm_package_version: string;
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
		PUBLIC_PROMPT_FIREBASE_AUTH_DOMAIN: string;
		PUBLIC_WORK_FIREBASE_APP_ID: string;
		PUBLIC_SOCIAL_FIREBASE_STORAGE_BUCKET: string;
		PUBLIC_STORY_FIREBASE_APP_ID: string;
		PUBLIC_STORY_FIREBASE_API_KEY: string;
		PUBLIC_HOME_DESIGN_FIREBASE_API_KEY: string;
		PUBLIC_HOME_DESIGN_FIREBASE_APP_ID: string;
		PUBLIC_HOME_DESIGN_FIREBASE_AUTH_DOMAIN: string;
		PUBLIC_STORY_FIREBASE_AUTH_DOMAIN: string;
		PUBLIC_STORY_FIREBASE_PROJECT_ID: string;
		PUBLIC_SOCIAL_FIREBASE_API_KEY: string;
		PUBLIC_STORY_FIREBASE_STORAGE_BUCKET: string;
		PUBLIC_PROMPT_FIREBASE_MESSAGING_SENDER_ID: string;
		PUBLIC_TODO_FIREBASE_API_KEY: string;
		PUBLIC_HOME_DESIGN_FIREBASE_STORAGE_BUCKET: string;
		PUBLIC_TODO_FIREBASE_MESSAGING_SENDER_ID: string;
		PUBLIC_SOCIAL_FIREBASE_AUTH_DOMAIN: string;
		PUBLIC_SOCIAL_FIREBASE_PROJECT_ID: string;
		PUBLIC_WORK_FIREBASE_API_KEY: string;
		PUBLIC_TODO_FIREBASE_APP_ID: string;
		PUBLIC_WORK_FIREBASE_STORAGE_BUCKET: string;
		PUBLIC_PROMPT_FIREBASE_API_KEY: string;
		PUBLIC_PROMPT_FIREBASE_PROJECT_ID: string;
		PUBLIC_TODO_FIREBASE_AUTH_DOMAIN: string;
		PUBLIC_PROMPT_FIREBASE_APP_ID: string;
		PUBLIC_WORK_FIREBASE_MESSAGING_SENDER_ID: string;
		PUBLIC_YOUTUBE_API_KEY: string;
		PUBLIC_WORK_FIREBASE_PROJECT_ID: string;
		PUBLIC_SOCIAL_FIREBASE_MESSAGING_SENDER_ID: string;
		PUBLIC_HOME_DESIGN_FIREBASE_MESSAGING_SENDER_ID: string;
		PUBLIC_PROMPT_FIREBASE_STORAGE_BUCKET: string;
		PUBLIC_SOCIAL_FIREBASE_APP_ID: string;
		PUBLIC_WORK_FIREBASE_AUTH_DOMAIN: string;
		PUBLIC_TODO_FIREBASE_STORAGE_BUCKET: string;
		PUBLIC_STORY_FIREBASE_MESSAGING_SENDER_ID: string;
		PUBLIC_TODO_FIREBASE_PROJECT_ID: string;
		[key: `PUBLIC_${string}`]: string | undefined;
	}
}
