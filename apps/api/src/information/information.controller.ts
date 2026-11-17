import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthUser } from '@acca-cbt/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MAX_UPLOAD_BYTES } from '../storage/storage.service';
import { InformationService } from './information.service';

@ApiTags('Public Information')
@Controller('information')
@UseGuards(JwtAuthGuard)
export class InformationController {
  constructor(private readonly information: InformationService) {}

  @Public()
  @Get('public')
  listPublic() { return this.information.list(); }

  @Public()
  @Get('public/:id/file')
  async file(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { doc, object } = await this.information.publicFile(id);
    const fileName = doc.file_name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'informasi.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=300');
    if (object.contentLength !== undefined) res.setHeader('Content-Length', object.contentLength);
    if (object.etag) res.setHeader('ETag', object.etag);
    object.stream.on('error', () => res.destroy());
    object.stream.pipe(res);
  }

  @Public()
  @Get('public/:id')
  async getPublic(@Param('id', ParseUUIDPipe) id: string) {
    const doc = await this.information.publicDocument(id);
    return { document: { id: doc.id, folder_id: doc.folder_id, title: doc.title,
      file_name: doc.file_name, size_bytes: doc.size_bytes, created_at: doc.created_at } };
  }

  @Get('admin')
  listAdmin(@CurrentUser() user: AuthUser) {
    this.information.assertAdmin(user);
    return this.information.list(true);
  }

  @Post('admin/folders')
  createFolder(@CurrentUser() user: AuthUser, @Body() body: { name?: string }) {
    return this.information.createFolder(user, body);
  }

  @Patch('admin/folders/:id')
  updateFolder(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: { name?: string }) {
    return this.information.updateFolder(user, id, body);
  }

  @Delete('admin/folders/:id')
  deleteFolder(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.information.deleteFolder(user, id);
  }

  @Post('admin/documents')
  @ApiConsumes('multipart/form-data')
  @Roles('ADMIN')
  @UseGuards(RolesGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(@CurrentUser() user: AuthUser, @Body('folder_id') folderId: string,
    @Body('title') title: string, @UploadedFile() file: Express.Multer.File | undefined) {
    this.information.assertAdmin(user);
    // ParseUUIDPipe cannot be used on a multipart body field without a DTO.
    if (typeof folderId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(folderId)) {
      throw new BadRequestException('Folder tidak valid.');
    }
    return this.information.upload(user, folderId, title, file);
  }

  @Patch('admin/documents/:id')
  updateDocument(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { title?: string; folder_id?: string; published?: boolean }) {
    return this.information.updateDocument(user, id, body);
  }

  @Delete('admin/documents/:id')
  deleteDocument(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.information.deleteDocument(user, id);
  }
}
