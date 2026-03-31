import os

from toolbox import FriendlyException, default_user_name, get_conf


def validate_path_safety(path_or_url, user):
    path_private_upload, path_logging = get_conf("PATH_PRIVATE_UPLOAD", "PATH_LOGGING")
    sensitive_path = None
    path_or_url = os.path.relpath(path_or_url)
    if path_or_url.startswith(path_logging):
        sensitive_path = path_logging
    elif path_or_url.startswith(path_private_upload):
        sensitive_path = path_private_upload
    elif path_or_url.startswith("tests") or path_or_url.startswith("build"):
        return True
    else:
        raise FriendlyException(
            f"输入文件的路径 ({path_or_url}) 存在，但位置非法。请将文件上传后再执行该任务。"
        )

    allowed_users = [user, "autogen", "arxiv_cache", default_user_name]
    for user_allowed in allowed_users:
        if f"{os.sep}".join(path_or_url.split(os.sep)[:2]) == os.path.join(
            sensitive_path, user_allowed
        ):
            return True

    raise FriendlyException(
        f"输入文件的路径 ({path_or_url}) 存在，但属于其他用户。请将文件上传后再执行该任务。"
    )
