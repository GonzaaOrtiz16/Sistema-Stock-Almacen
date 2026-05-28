import log from 'electron-log/main'

log.transports.file.level = 'debug'
log.transports.file.maxSize = 10 * 1024 * 1024 // 10 MB
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'
log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'warn'
log.transports.console.format = '[{h}:{i}:{s}] [{level}] {text}'

export default log
