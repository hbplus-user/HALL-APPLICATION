export default function StatCards({ stats }) {
  return (
    <div className="dashboard-grid">
      <div className="stat-card">
        <i className="fas fa-users"></i>
        <h3 id="total-candidates">{stats.total}</h3>
        <p>Total Candidates</p>
      </div>
      <div className="stat-card">
        <i className="fas fa-check-circle"></i>
        <h3 id="completed-exams">{stats.completed}</h3>
        <p>Completed</p>
      </div>
      <div className="stat-card">
        <i className="fas fa-times-circle"></i>
        <h3 id="disqualified">{stats.disqualified}</h3>
        <p>Disqualified</p>
      </div>
      <div className="stat-card">
        <i className="fas fa-sync-alt"></i>
        <h3 id="in-progress">{stats.inProgress}</h3>
        <p>In Progress</p>
      </div>
    </div>
  );
}
