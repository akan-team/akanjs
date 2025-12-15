import { Logger } from "@akanjs/common";
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";

import type { GqlReqType, ReqType } from "./authorization";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exception Filter");
  catch(exception: Error, host: ArgumentsHost) {
    if (host.getType() !== "http") {
      const gqlArgs: object[] = host.getArgByIndex(1);
      const gqlReq: GqlReqType | undefined = host.getArgByIndex(3);
      const reqType = gqlReq?.parentType?.name ?? "unknown";
      const reqName = gqlReq?.fieldName ?? "unknown";
      this.logger.error(
        `GraphQL Error\nRequest: ${reqType}-${reqName}\nArgs: ${JSON.stringify(gqlArgs, null, 2)}\n${exception.stack}`
      );
      throw exception;
    }
    const ctx = host.switchToHttp();
    const res: { status: (status: number) => { json: (data) => void } } = ctx.getResponse();
    const req: ReqType = ctx.getRequest();
    const reqType: string = req.method;
    const reqName: string = req.url;
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    res.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: req.url,
      message: exception instanceof HttpException ? exception.getResponse() : exception.message,
    });
    this.logger.error(
      `Http Error: ${status}\nRequest: ${reqType}-${reqName}\nBody: ${JSON.stringify(req.body, null, 2)}\n${
        exception.stack
      }`
    );
  }
}
