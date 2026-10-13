"""Read only the dedicated local acceptance credential into a private IPC pipe."""

import ctypes
import json
import os
import resource
import stat
import sys


def read_credentials():
    if sys.platform != "darwin":
        raise RuntimeError("native_keychain_unavailable")
    output_mode = os.fstat(sys.stdout.fileno()).st_mode
    if not (stat.S_ISFIFO(output_mode) or stat.S_ISSOCK(output_mode)):
        raise RuntimeError("private_pipe_required")

    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    security = ctypes.CDLL("/System/Library/Frameworks/Security.framework/Security")
    foundation = ctypes.CDLL(
        "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation"
    )
    security.SecKeychainSetUserInteractionAllowed.argtypes = [ctypes.c_ubyte]
    security.SecKeychainSetUserInteractionAllowed.restype = ctypes.c_int32
    security.SecKeychainFindGenericPassword.argtypes = [
        ctypes.c_void_p,
        ctypes.c_uint32,
        ctypes.c_char_p,
        ctypes.c_uint32,
        ctypes.c_char_p,
        ctypes.POINTER(ctypes.c_uint32),
        ctypes.POINTER(ctypes.c_void_p),
        ctypes.POINTER(ctypes.c_void_p),
    ]
    security.SecKeychainFindGenericPassword.restype = ctypes.c_int32
    security.SecKeychainItemFreeContent.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
    security.SecKeychainItemFreeContent.restype = ctypes.c_int32
    foundation.CFRelease.argtypes = [ctypes.c_void_p]
    foundation.CFRelease.restype = None

    if security.SecKeychainSetUserInteractionAllowed(False) != 0:
        raise RuntimeError("noninteractive_guard_failed")
    service = b"Lens/local-acceptance"
    account = b"local-test"
    size = ctypes.c_uint32()
    data = ctypes.c_void_p()
    item = ctypes.c_void_p()
    try:
        status = security.SecKeychainFindGenericPassword(
            None,
            len(service),
            service,
            len(account),
            account,
            ctypes.byref(size),
            ctypes.byref(data),
            ctypes.byref(item),
        )
        if status != 0 or not data.value or not 0 < size.value <= 4096:
            raise RuntimeError("local_test_credentials_unavailable")
        payload = json.loads(ctypes.string_at(data, size.value))
        if not all(
            isinstance(payload.get(key), str) and payload[key]
            for key in ("username", "password")
        ):
            raise RuntimeError("invalid_local_test_credential_schema")
        return {key: payload[key] for key in ("username", "password")}
    finally:
        if data.value:
            ctypes.memset(data, 0, size.value)
            security.SecKeychainItemFreeContent(None, data)
        if item.value:
            foundation.CFRelease(item)


if __name__ == "__main__":
    try:
        credentials = read_credentials()
        encoded = bytearray(json.dumps(credentials).encode("utf-8"))
        credentials.clear()
        try:
            if len(encoded) > 4096:
                raise RuntimeError("credential_payload_too_large")
            sys.stdout.buffer.write(encoded)
            sys.stdout.buffer.flush()
        finally:
            encoded[:] = b"\x00" * len(encoded)
    except Exception:
        sys.stderr.write("local_test_credentials_unavailable\n")
        sys.exit(1)
