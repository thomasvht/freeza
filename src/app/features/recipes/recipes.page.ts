import { ChangeDetectionStrategy, Component } from '@angular/core';
import { S } from '../../strings';

@Component({
  selector: 'app-recipes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1 class="t-title">{{ title }}</h1>`,
})
export class RecipesPage {
  protected readonly title = S.pages.recipes;
}
