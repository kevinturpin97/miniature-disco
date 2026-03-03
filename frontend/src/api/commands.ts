/**
 * Command API calls.
 */

import client from "./client";
import type { Command, PaginatedResponse } from "@/types";

export async function createCommand(
  actuatorId: number,
  payload: Pick<Command, "command_type"> & { value?: number },
): Promise<Command> {
  const { data } = await client.post<Command>(
    `/actuators/${actuatorId}/commands/`,
    payload,
  );
  return data;
}

export async function listCommands(
  zoneId: number,
): Promise<PaginatedResponse<Command>> {
  const { data } = await client.get<PaginatedResponse<Command>>(
    `/zones/${zoneId}/commands/`,
  );
  return data;
}
