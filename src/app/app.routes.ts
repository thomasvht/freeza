import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/freezer/freezer.page').then((m) => m.FreezerPage) },
  { path: 'recipes', loadComponent: () => import('./features/recipes/recipes.page').then((m) => m.RecipesPage) },
  { path: 'settings', loadComponent: () => import('./features/settings/settings.page').then((m) => m.SettingsPage) },
  { path: '**', redirectTo: '' },
];
