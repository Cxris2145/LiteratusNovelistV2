import { Component, OnInit } from '@angular/core';
import { DashboardBooksService } from '../services/dashboard-books.service';

@Component({
  selector: 'app-users',
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.css']
})
export class UsersComponent implements OnInit {
  users: any[] = [];
  filteredUsers: any[] = [];
  loading = true;
  searchQuery = '';
  roleFilter = 'all';
  actionToast = '';
  selectedUserForRole: any = null;

  // Modal para ajustar tinta
  inkModalUser: any = null;
  inkAmount = 100;
  inkReason = 'Recarga de cortesía';
  savingInk = false;

  constructor(private dashboardService: DashboardBooksService) {}

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.loading = true;
    this.dashboardService.getUsers().subscribe({
      next: (data) => {
        this.users = data;
        this.applyFilters();
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  setRoleFilter(filter: string): void {
    this.roleFilter = filter;
    this.applyFilters();
  }

  applyFilters(): void {
    let result = this.users;

    if (this.roleFilter === 'reader') {
      result = result.filter(u => u.role?.toLowerCase().includes('lect') || u.role === 'reader');
    } else if (this.roleFilter === 'author') {
      result = result.filter(u => u.role?.toLowerCase().includes('aut') || u.role === 'author');
    } else if (this.roleFilter === 'admin') {
      result = result.filter(u => u.role?.toLowerCase().includes('admin'));
    }

    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase().trim();
      result = result.filter(u =>
        u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      );
    }

    this.filteredUsers = result;
  }

  toggleActive(user: any): void {
    const action = user.is_active !== false ? 'bloquear' : 'desbloquear';
    if (!confirm(`¿Estás seguro de ${action} a ${user.username}?`)) return;

    this.dashboardService.toggleActiveUser(user.id).subscribe({
      next: (res) => {
        user.is_active = res.is_active;
        this.actionToast = res.message;
        setTimeout(() => this.actionToast = '', 3500);
      },
      error: (err) => alert(err.error?.error || 'Error al cambiar estado del usuario.')
    });
  }

  changeRole(user: any, newRole: string): void {
    if (!confirm(`¿Cambiar el rol de ${user.username} a ${newRole}?`)) return;

    this.dashboardService.changeUserRole(user.id, newRole).subscribe({
      next: (res) => {
        user.role = res.role_display;
        this.actionToast = res.message;
        setTimeout(() => this.actionToast = '', 3500);
      },
      error: (err) => alert(err.error?.error || 'Error al cambiar rol.')
    });
  }

  openInkModal(user: any): void {
    this.inkModalUser = user;
    this.inkAmount = 100;
    this.inkReason = 'Bono de bienvenida / Cortesía administrativa';
  }

  closeInkModal(): void {
    this.inkModalUser = null;
  }

  submitInkAdjustment(): void {
    if (!this.inkModalUser) return;
    this.savingInk = true;

    this.dashboardService.adjustUserInk(this.inkModalUser.id, this.inkAmount, this.inkReason).subscribe({
      next: (res) => {
        this.inkModalUser.ink_balance = res.ink_balance;
        this.savingInk = false;
        this.closeInkModal();
        this.actionToast = res.message;
        setTimeout(() => this.actionToast = '', 3500);
      },
      error: (err) => {
        this.savingInk = false;
        alert(err.error?.error || 'Error al ajustar tinta.');
      }
    });
  }

  get totalReaders(): number {
    return this.users.filter(u => u.role?.toLowerCase().includes('lect') || u.role === 'reader').length;
  }

  get totalAuthors(): number {
    return this.users.filter(u => u.role?.toLowerCase().includes('aut') || u.role === 'author').length;
  }

  get totalAdmins(): number {
    return this.users.filter(u => u.role?.toLowerCase().includes('admin')).length;
  }
}
