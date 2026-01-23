import { Component, output, ChangeDetectionStrategy } from '@angular/core';

/**
 * Header component that displays app title and logout button
 */
@Component({
  selector: 'app-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
})
export class HeaderComponent {
  logout = output<void>();
}
