/**
 * graphql/dataSources/UserDataSource.ts — User DB Access Layer
 *
 * Thin wrapper around the User Mongoose model. Keeps raw DB calls out of
 * resolvers and centralises user-related queries in one place.
 *
 * saveRefreshToken is called on every login, token rotation, and logout.
 * Passing null on logout effectively revokes the token server-side.
 */

import { User } from "../../models/User.js";
import { AppError } from "../../utils/AppError.js";

export class UserDataSources {
  constructor(private model: typeof User) {}

  async findUserById(id: string) {
    const user = await this.model.findById(id);
    if (!user) throw new AppError("User not found", 404);
    return user;
  }

  async createUser(input: any) {
    return await this.model.create(input);
  }

  async findUserByEmail(email: string) {
    return await this.model.findOne({ email });
  }

  /**
   * Persists a refresh token to the user document.
   * Pass null to revoke (logout).
   */
  async saveRefreshToken(refreshToken: string | null, userId: string) {
    const user = await this.model.findById(userId);
    if (!user) throw new AppError(`The user was not found`, 404);

    user.refreshToken = refreshToken as string;
    await user.save();
  }

  async findAll() {
    return await this.model.find();
  }
}
