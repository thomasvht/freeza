import { ChangeDetectionStrategy, Component } from '@angular/core';
import { S } from '../../strings';

@Component({
  selector: 'app-freezer-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1 class="t-title">{{ title }}</h1>`,
})
export class FreezerPage {
  protected readonly title = S.pages.freezer;
}
