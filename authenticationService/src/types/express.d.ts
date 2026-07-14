import type { Document } from "mongoose";
import type { IUser } from "../models/User.js";

declare global {
  namespace Express {
    interface Request {
      user?: Document & IUser;
    }
  }
}
