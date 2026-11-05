import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { IsActiveMatchOptions, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { ChefHat, LucideAngularModule, Plus, Snowflake } from 'lucide-angular';
import { S } from '../../strings';

@Component({
  selector: 'app-tab-bar',
  imports: [RouterLink, RouterLinkActive, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tab-bar.html',
  styleUrl: './tab-bar.scss',
})
export class TabBar {
  private readonly router = inject(Router);

  /** Emitted when + is tapped, before navigating to `/?add=1`. */
  readonly add = output<void>();

  protected readonly s = S.tabs;
  protected readonly icons = { freezer: Snowflake, add: Plus, recipes: ChefHat };
  protected readonly exactPath: IsActiveMatchOptions = {
    paths: 'exact',
    queryParams: 'ignored',
    matrixParams: 'ignored',
    fragment: 'ignored',
  };

  protected onAdd(): void {
    this.add.emit();
    void this.router.navigate(['/'], { queryParams: { add: 1 } });
  }
}
