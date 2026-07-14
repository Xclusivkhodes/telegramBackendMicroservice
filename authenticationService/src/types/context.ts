import type { IUser } from "../models/User.js";
import type { AudioDataSources } from "../graphql/dataSources/AudioDataSources.js";
import type { UserDataSources } from "../graphql/dataSources/UserDataSource.js";

export interface AppContext {
  user: (IUser & { id: string }) | null;
  dataSources: { users: UserDataSources; audios: AudioDataSources };
  req: Request;
  res: Response;
}
