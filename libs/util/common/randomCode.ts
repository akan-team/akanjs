import { pad } from "./pad";

export const randomCode = (length = 6) => pad(Math.floor(Math.random() * 10 ** length), length);
