import type { LoadedLocalAssets } from './fsLoader';
import type { SessionBundle } from './zImagePipeline';

type RuntimeCache = {
  assets: LoadedLocalAssets | null;
  sessions: SessionBundle | null;
};

const cache: RuntimeCache = {
  assets: null,
  sessions: null
};

export function setRuntimeAssets(assets: LoadedLocalAssets): void {
  cache.assets = assets;
}

export function setRuntimeSessions(sessions: SessionBundle): void {
  cache.sessions = sessions;
}

export function getRuntimeAssets(): LoadedLocalAssets | null {
  return cache.assets;
}

export function getRuntimeSessions(): SessionBundle | null {
  return cache.sessions;
}

export async function releaseRuntimeSessions(): Promise<void> {
  const sessions = cache.sessions;
  if (!sessions) return;

  for (const session of sessions.ordered) {
    await session.release();
  }
}

export function clearRuntimeCache(): void {
  cache.assets = null;
  cache.sessions = null;
}
