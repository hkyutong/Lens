import os

from toolbox import FriendlyException, default_user_name, get_conf
from shared_utils.lens_storage import get_shared_upload_root, path_is_within


def validate_path_safety(path_or_url, user):
    path_private_upload, path_logging = get_conf("PATH_PRIVATE_UPLOAD", "PATH_LOGGING")
    path_private_upload = os.path.abspath(path_private_upload)
    path_logging = os.path.abspath(path_logging)
    path_shared_upload = get_shared_upload_root()
    abs_path = os.path.abspath(path_or_url)
    if path_is_within(abs_path, path_shared_upload):
        return True
    if abs_path.startswith(os.path.abspath("tests")) or abs_path.startswith(os.path.abspath("build")):
        return True

    sensitive_path = None
    if path_is_within(abs_path, path_logging):
        sensitive_path = path_logging
    elif path_is_within(abs_path, path_private_upload):
        sensitive_path = path_private_upload
    else:
        raise FriendlyException(
            f"输入文件的路径 ({abs_path}) 存在，但位置非法。请将文件上传后再执行该任务。"
        )

    allowed_users = [user, "autogen", "arxiv_cache", default_user_name]
    for user_allowed in allowed_users:
        if path_is_within(abs_path, os.path.join(sensitive_path, user_allowed)):
            return True

    raise FriendlyException(
        f"输入文件的路径 ({abs_path}) 存在，但属于其他用户。请将文件上传后再执行该任务。"
    )
