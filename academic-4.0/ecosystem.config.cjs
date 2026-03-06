module.exports = {
  apps: [
    {
      name: 'lens-academic',
      cwd: __dirname,
      script: './venv/bin/python',
      args: './shared_utils/fastapi_stream_server.py',
      interpreter: 'none',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1024M',
      env: {
        PYTHONUNBUFFERED: '1',
      },
    },
  ],
};
