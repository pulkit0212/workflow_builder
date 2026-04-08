import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type SearchableUser = {
  id: string;
  name: string;
  email: string;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async searchUsers(query: string, excludeUserIds: string[] = []) {
    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      return [];
    }

    const params: string[] = [`%${normalizedQuery}%`];
    const exclusions = excludeUserIds.length
      ? ` AND id NOT IN (${excludeUserIds
          .map((_, index) => {
            params.push(excludeUserIds[index]!);
            return `$${params.length}`;
          })
          .join(", ")})`
      : "";

    const rows = await this.prisma.$queryRawUnsafe(
      `
        SELECT
          id::text AS id,
          COALESCE(full_name, email) AS name,
          email
        FROM users
        WHERE (full_name ILIKE $1 OR email ILIKE $1)${exclusions}
        ORDER BY COALESCE(full_name, email) ASC
        LIMIT 10
      `,
      ...params,
    );

    return rows as SearchableUser[];
  }
}
