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

  constructor(private dashboardService: DashboardBooksService) {}

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers() {
    this.loading = true;
    this.dashboardService.getUsers().subscribe({
      next: (data) => {
        this.users = data;
        this.filteredUsers = data;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading users', err);
        this.loading = false;
      }
    });
  }

  filterUsers(event: Event) {
    const query = (event.target as HTMLInputElement).value.toLowerCase();
    this.filteredUsers = this.users.filter(u => 
      u.username.toLowerCase().includes(query) || 
      u.email.toLowerCase().includes(query)
    );
  }
}
