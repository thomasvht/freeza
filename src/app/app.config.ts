import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { ItemSheetService } from './features/item-sheet/item-sheet.service';
import { ITEM_SHEET, TAKE_OUT_SHEET } from './features/item-sheet/sheet.tokens';
import { TakeOutSheetService } from './features/item-sheet/take-out-sheet.service';

// No provideHttpClient: ApiClient uses fetch directly (see core/api.client.ts).
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes),
    { provide: ITEM_SHEET, useExisting: ItemSheetService },
    { provide: TAKE_OUT_SHEET, useExisting: TakeOutSheetService },
  ],
};
