import { ChangeDetectionStrategy, Component } from '@angular/core';
import { S } from '../../strings';

@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1 class="t-title">{{ title }}</h1>`,
})
export class SettingsPage {
  protected readonly title = S.pages.settings;
}
