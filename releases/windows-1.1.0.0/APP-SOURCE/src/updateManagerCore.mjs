// No browser APIs: pure validation/decision code with deterministic Node tests.
export const PRODUCT = 'animated-3d-chess';
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export function parts(version) {
  if (typeof version !== 'string' || !SEMVER.test(version)) throw Error('INVALID_VERSION');
  const result = version.split('.').map(Number);
  if (!result.every(Number.isSafeInteger)) throw Error('INVALID_VERSION');
  return result;
}
export function compareVersions(a,b) {
  const x=parts(a),y=parts(b);
  for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;
  return 0;
}
export function getLatestVersion(payload,channel) {
  if (!payload || typeof payload!=='object' || Array.isArray(payload) ||
      payload.schemaVersion!==1 || payload.product!==PRODUCT ||
      !payload.channels || typeof payload.channels!=='object')throw Error('INVALID_UPDATE_MANIFEST');
  if (!['web','pwa','microsoft-store'].includes(channel))throw Error('INVALID_CHANNEL');
  const item=payload.channels[channel];
  if (!item || typeof item!=='object')throw Error('INVALID_UPDATE_CHANNEL');
  parts(item.version);
  return item.version;
}
export function evaluateUpdate({latest,current,waiting=false}) {
  return compareVersions(latest,current)>0 || Boolean(waiting);
}
