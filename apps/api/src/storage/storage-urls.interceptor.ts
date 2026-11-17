import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map } from 'rxjs/operators';
import { StorageService } from './storage.service';

@Injectable()
export class StorageUrlsInterceptor implements NestInterceptor {
    constructor(private readonly storage: StorageService) {}
    intercept(context: ExecutionContext, next: CallHandler) {
        // Media pemasaran memang memakai URL publik agar dapat diambil platform sosial.
        if (Reflect.getMetadata('storage:preserve-public-urls', context.getClass()) === true) return next.handle();
        return next.handle().pipe(map(value => this.storage.protectUrls(value)));
    }
}
