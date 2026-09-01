import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuthorDetailPageComponent } from './author-detail-page.component';

describe('AuthorDetailPageComponent', () => {
  let component: AuthorDetailPageComponent;
  let fixture: ComponentFixture<AuthorDetailPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AuthorDetailPageComponent]
    })
    .compileComponents();
    
    fixture = TestBed.createComponent(AuthorDetailPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
