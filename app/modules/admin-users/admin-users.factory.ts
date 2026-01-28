/**
 * Admin Users Factory
 * Creates and wires up admin-users module dependencies
 */

import { Client } from '@elastic/elasticsearch';
import { AdminUsersRepository } from './admin-users.repository';
import { AdminUsersService } from './admin-users.service';

export function createAdminUsersModule(esClient: Client) {
  const repository = new AdminUsersRepository(esClient);
  const service = new AdminUsersService(repository);

  return {
    repository,
    service,
  };
}

