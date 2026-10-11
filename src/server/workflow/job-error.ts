/** Error a job handler throws to control retry behaviour. Anything else counts as transient. */
export class JobError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly permanent = false,
  ) {
    super(message);
    this.name = "JobError";
  }
}
