// The API may expose an opaque public identity instead of its numeric JWT actor.
// Mapping that identity requires both explicit account bindings; it never
// substitutes for the server's token authentication or the gate's JWT check.
function numericActorId(value) {
  const numeric = typeof value === 'number' ? value :
    typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : 0;
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : 0;
}

export function resolveControlledWriteActor(info, expectedActor, bindings = {}) {
  const id = info?.id;
  const numericIdentity = numericActorId(id);
  if (numericIdentity) return numericIdentity;

  const publicIdentity = id;
  const expectedPublicIdentity = bindings.publicIdentity;
  const username = info?.username;
  const expectedUsername = bindings.username;
  const actor = numericActorId(expectedActor);
  const validPublicIdentity = value =>
    typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) && !/^\d+$/.test(value);
  const validUsername = value =>
    typeof value === 'string' && value.length > 0 && value.length <= 256;

  if (
    actor > 0 &&
    validPublicIdentity(publicIdentity) &&
    validPublicIdentity(expectedPublicIdentity) &&
    publicIdentity === expectedPublicIdentity &&
    validUsername(username) && validUsername(expectedUsername) &&
    username === expectedUsername
  ) {
    return actor;
  }

  return 0;
}
