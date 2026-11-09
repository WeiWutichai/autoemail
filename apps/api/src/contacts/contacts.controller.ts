import { Controller, Get, Query } from '@nestjs/common';
import {
  contactListQuerySchema,
  type ContactDto,
  type ContactListQuery,
  type Paginated,
} from '@erp-mail/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ContactsService } from './contacts.service';

@Controller('contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(contactListQuerySchema)) query: ContactListQuery,
  ): Promise<Paginated<ContactDto>> {
    return this.contacts.list(query);
  }
}
