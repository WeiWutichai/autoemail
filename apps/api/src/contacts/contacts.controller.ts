import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  contactListQuerySchema,
  createContactSchema,
  updateContactSchema,
  type ContactDto,
  type ContactListQuery,
  type CreateContactInput,
  type Paginated,
  type UpdateContactInput,
} from '@erp-mail/shared';
import { Audit } from '../audit/audit.decorator';
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

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ContactDto> {
    return this.contacts.get(id);
  }

  @Post()
  @Audit('contact.create')
  create(
    @Body(new ZodValidationPipe(createContactSchema)) body: CreateContactInput,
  ): Promise<ContactDto> {
    return this.contacts.create(body);
  }

  @Patch(':id')
  @Audit('contact.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateContactSchema)) body: UpdateContactInput,
  ): Promise<ContactDto> {
    return this.contacts.update(id, body);
  }

  @Delete(':id')
  @Audit('contact.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.contacts.remove(id);
  }
}
