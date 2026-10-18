"""Locate an existing Lens runtime daemon without invoking the PM2 CLI."""

import json
import os
from pathlib import Path
import re
import stat


def _read_bounded(file, limit):
    with file.open('rb') as stream:
        value = stream.read(limit + 1)
    if len(value) > limit:
        raise ValueError('runtime_metadata_invalid')
    return value


def _verified_script(command):
    for argument in command.decode('utf-8', errors='strict').split('\0'):
        value = argument.strip()
        if value.startswith('node '):
            value = value[5:]
        script = Path(value)
        if not script.is_absolute() or script.name != 'main.js' or script.parent.name != 'dist':
            continue
        if not any(part.lower() == 'lens' for part in script.parts):
            continue
        if not script.is_file():
            continue
        package = script.parent.parent / 'package.json'
        metadata = json.loads(_read_bounded(package, 1048576))
        dependencies = metadata.get('dependencies') if type(metadata) is dict else None
        if type(dependencies) is dict and dependencies.get('@nestjs/core'):
            return script
    return None


def _existing_socket(home, owner):
    if not home.is_absolute() or home.resolve() != home:
        raise ValueError('runtime_socket_invalid')
    rpc = home / 'rpc.sock'
    try:
        info = rpc.lstat()
    except OSError:
        raise ValueError('runtime_socket_invalid') from None
    if not stat.S_ISSOCK(info.st_mode) or info.st_uid != owner:
        raise ValueError('runtime_socket_invalid')
    return rpc


def discover_rpc(default_home, proc_root=Path('/proc')):
    """Only read a process environment after verifying its Lens Nest bundle.

    Returned paths are private implementation data. Callers must never print
    them or include them in an exception. Ambiguous verified runtimes fail
    closed instead of selecting a convenient daemon.
    """
    sockets = set()
    try:
        processes = list(proc_root.iterdir())
    except OSError:
        processes = []
    if len(processes) > 65536:
        raise ValueError('runtime_discovery_ambiguous')
    for process in processes:
        if not re.fullmatch(r'[0-9]+', process.name):
            continue
        try:
            command = _read_bounded(process / 'cmdline', 16384)
            if _verified_script(command) is None:
                continue
            environment = _read_bounded(process / 'environ', 1048576)
            homes = [item[len(b'PM2_HOME='):] for item in environment.split(b'\0')
                     if item.startswith(b'PM2_HOME=')]
            if len(homes) != 1 or not homes[0]:
                continue
            home = Path(homes[0].decode('utf-8', errors='strict'))
            owner = process.stat().st_uid
        except (OSError, ValueError, UnicodeError):
            continue
        sockets.add(_existing_socket(home, owner))
    if len(sockets) > 1:
        raise ValueError('runtime_discovery_ambiguous')
    if sockets:
        return next(iter(sockets))
    return _existing_socket(Path(default_home), os.getuid())
