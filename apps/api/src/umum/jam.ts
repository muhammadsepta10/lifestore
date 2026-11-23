import { Global, Injectable, Module } from '@nestjs/common';

/** Sumber waktu "sekarang". Tes menggantinya supaya kunci PIN sementara bisa diuji tanpa menunggu. */
@Injectable()
export class Jam {
  sekarang(): Date {
    return new Date();
  }
}

@Global()
@Module({ providers: [Jam], exports: [Jam] })
export class JamModule {}
