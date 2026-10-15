import { via } from "akanjs/constant";

export class FileUploadTicket extends via((field) => ({
  ticket: field(String), // spent by the first upload that carries it
  uploadUrl: field(String),
  expiresAt: field(Date),
})) {}
