export interface ILogger {
  debug(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string, err?: unknown): void;
}

export const defaultLogger: ILogger = {
  debug: (msg) => { if (process.env.DEBUG) console.debug(msg); },
  info: (msg) => console.log(msg),
  warn: (msg) => console.warn(msg),
  error: (msg, err) => console.error(msg, err),
};
