module.exports = {
  apps: [
    {
      name: 'nine-dart-nation',
      script: 'server/server.js',
      cwd: './',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 8787
      }
    }
  ]
}
