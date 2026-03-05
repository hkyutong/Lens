import multiprocessing
import pickle
import platform
import traceback

from loguru import logger


def run_in_subprocess_wrapper_func(v_args, conn):
    func, args, kwargs = pickle.loads(v_args)
    try:
        result = func(*args, **kwargs)
        conn.send(("result", result))
    except Exception as e:
        conn.send(("exception", {"message": str(e), "traceback": traceback.format_exc()}))
    finally:
        conn.close()


def run_in_subprocess_with_timeout(func, timeout=60):
    if platform.system() != "Linux":
        return func

    def wrapper(*args, **kwargs):
        process = None
        parent_conn = None
        try:
            parent_conn, child_conn = multiprocessing.Pipe(duplex=False)
            v_args = pickle.dumps((func, args, kwargs))
            process = multiprocessing.Process(
                target=run_in_subprocess_wrapper_func, args=(v_args, child_conn)
            )
            process.start()
            process.join(timeout)
            if process.is_alive():
                process.terminate()
                process.join(3)
                raise TimeoutError(f"功能单元{str(func)}未能在规定时间内完成任务")
            if parent_conn.poll(0.1):
                status, payload = parent_conn.recv()
                if status == "result":
                    return payload
                if status == "exception":
                    message = payload.get("message", "子进程执行失败")
                    tb = payload.get("traceback", "")
                    raise RuntimeError(f"{message}\n{tb}".strip())
            raise RuntimeError(f"功能单元{str(func)}子进程未返回结果")
        except Exception as e:
            # 某些 Linux 运行环境（受限 stdout/daemon）下多进程可能无法稳定启动，回退到同进程执行。
            logger.warning(f"run_in_subprocess_with_timeout fallback: {e}")
            return func(*args, **kwargs)
        finally:
            if parent_conn is not None:
                try:
                    parent_conn.close()
                except Exception:
                    pass
            if process is not None:
                try:
                    process.close()
                except Exception:
                    pass

    return wrapper
