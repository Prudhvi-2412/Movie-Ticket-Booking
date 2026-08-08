import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Navbar } from '../components/Navbar';
import { Footer } from '../components/Footer';
import { Shield, TrendingUp, Users, Film, PlusCircle, RefreshCw, Activity, Zap, CheckCircle2 } from 'lucide-react';

export const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('analytics'); // analytics, movies, shows, logs, users
  const [revenue, setRevenue] = useState([]);
  const [occupancy, setOccupancy] = useState([]);
  const [logs, setLogs] = useState([]);
  const [userList, setUserList] = useState([]);
  const [loading, setLoading] = useState(true);

  // New Movie Form state
  const [movieForm, setMovieForm] = useState({
    title: '',
    genre: 'Action',
    language: 'Hindi',
    duration_minutes: 150,
    release_date: '2026-05-20',
    rating: 8.5,
    poster_url: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&auto=format&fit=crop&q=80',
    banner_url: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1200&auto=format&fit=crop&q=80',
    description: 'High-octane action adventure thriller.'
  });

  // New Show Form state
  const [showForm, setShowForm] = useState({
    movie_id: 1,
    screen_id: 1,
    show_time: '2026-05-20T18:00',
    price: 400
  });

  useEffect(() => {
    fetchAdminData();
  }, [activeTab]);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'analytics') {
        const revRes = await api.get('/admin/analytics/revenue');
        const occRes = await api.get('/admin/analytics/occupancy');
        if (revRes.success) setRevenue(revRes.revenue);
        if (occRes.success) setOccupancy(occRes.occupancy);
      } else if (activeTab === 'logs') {
        const logRes = await api.get('/admin/audit-logs');
        if (logRes.success) setLogs(logRes.logs);
      } else if (activeTab === 'users') {
        const userRes = await api.get('/admin/users');
        if (userRes.success) setUserList(userRes.users);
      }
    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMovie = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/movies', movieForm);
      if (res.success) {
        alert('Movie created successfully!');
        setMovieForm({ ...movieForm, title: '' });
      }
    } catch (err) {
      alert('Error creating movie: ' + err.message);
    }
  };

  const handleCreateShow = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/shows', showForm);
      if (res.success) {
        alert('Show scheduled successfully!');
      }
    } catch (err) {
      alert('Error scheduling show: ' + err.message);
    }
  };

  const handleTriggerDynamicPrice = async (showId) => {
    try {
      const res = await api.post(`/shows/${showId}/dynamic-price`, {});
      alert(`Dynamic price updated! Current Price: ₹${res.currentPrice}`);
      fetchAdminData();
    } catch (err) {
      alert('Error updating price: ' + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-gray-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <span className="badge badge-gold mb-1">SYSTEM ADMINISTRATOR PORTAL</span>
            <h1 className="text-3xl font-black text-white flex items-center gap-2">
              <Shield className="w-8 h-8 text-amber-400" /> Admin Analytics & Controls
            </h1>
          </div>

          {/* Tab Controls */}
          <div className="flex flex-wrap items-center gap-2 bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800 text-xs">
            {[
              { id: 'analytics', label: 'Analytics & Revenue', icon: TrendingUp },
              { id: 'movies', label: 'Manage Movies', icon: Film },
              { id: 'shows', label: 'Schedule Shows', icon: PlusCircle },
              { id: 'logs', label: 'Audit Logs', icon: Activity },
              { id: 'users', label: 'Manage Users', icon: Users }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-gray-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab 1: Analytics & Revenue */}
        {activeTab === 'analytics' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Movie Revenue Table (From View `movie_revenue`) */}
              <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-4">
                <h3 className="text-lg font-bold text-white flex items-center justify-between">
                  <span className="flex items-center gap-2"><TrendingUp className="w-5 h-5 text-emerald-400" /> Revenue by Movie</span>
                  <span className="text-[10px] font-mono text-gray-500 uppercase">View: movie_revenue</span>
                </h3>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left text-gray-300">
                    <thead className="bg-slate-900 text-gray-400 uppercase font-semibold">
                      <tr>
                        <th className="p-3">Movie Title</th>
                        <th className="p-3">Total Bookings</th>
                        <th className="p-3 text-right">Total Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {revenue.map(r => (
                        <tr key={r.movie_id} className="hover:bg-slate-900/40">
                          <td className="p-3 font-bold text-white">{r.movie_title}</td>
                          <td className="p-3">{r.total_bookings}</td>
                          <td className="p-3 text-right font-mono font-bold text-emerald-400">₹{r.total_revenue || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Theater Occupancy Table (From View `theater_occupancy`) */}
              <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-4">
                <h3 className="text-lg font-bold text-white flex items-center justify-between">
                  <span className="flex items-center gap-2"><Zap className="w-5 h-5 text-amber-400" /> Theater Occupancy Rate</span>
                  <span className="text-[10px] font-mono text-gray-500 uppercase">View: theater_occupancy</span>
                </h3>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left text-gray-300">
                    <thead className="bg-slate-900 text-gray-400 uppercase font-semibold">
                      <tr>
                        <th className="p-3">Theater</th>
                        <th className="p-3">Showtime</th>
                        <th className="p-3">Occupancy</th>
                        <th className="p-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {occupancy.map(o => (
                        <tr key={o.show_id} className="hover:bg-slate-900/40">
                          <td className="p-3 font-semibold text-white">{o.theater_name}</td>
                          <td className="p-3 text-gray-400">{new Date(o.show_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                          <td className="p-3">
                            <span className={`badge ${Number(o.occupancy_percentage) > 80 ? 'badge-red' : 'badge-gold'}`}>
                              {Number(o.occupancy_percentage).toFixed(1)}%
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => handleTriggerDynamicPrice(o.show_id)}
                              className="btn-secondary py-1 px-2 text-[10px] text-amber-400"
                              title="Trigger MySQL Procedure UpdateDynamicPrice"
                            >
                              Dynamic Price
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Manage Movies */}
        {activeTab === 'movies' && (
          <div className="glass-panel p-8 rounded-3xl border border-slate-800 max-w-2xl mx-auto space-y-6">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <PlusCircle className="w-6 h-6 text-amber-400" /> Create & Add New Movie
            </h3>

            <form onSubmit={handleCreateMovie} className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-400 mb-1">Movie Title</label>
                <input
                  type="text"
                  required
                  value={movieForm.title}
                  onChange={e => setMovieForm({...movieForm, title: e.target.value})}
                  className="w-full bg-slate-900 p-3 rounded-xl border border-slate-800 text-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-400 mb-1">Genre</label>
                  <input
                    type="text"
                    value={movieForm.genre}
                    onChange={e => setMovieForm({...movieForm, genre: e.target.value})}
                    className="w-full bg-slate-900 p-3 rounded-xl border border-slate-800 text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 mb-1">Language</label>
                  <input
                    type="text"
                    value={movieForm.language}
                    onChange={e => setMovieForm({...movieForm, language: e.target.value})}
                    className="w-full bg-slate-900 p-3 rounded-xl border border-slate-800 text-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Poster Image URL</label>
                <input
                  type="text"
                  value={movieForm.poster_url}
                  onChange={e => setMovieForm({...movieForm, poster_url: e.target.value})}
                  className="w-full bg-slate-900 p-3 rounded-xl border border-slate-800 text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Description</label>
                <textarea
                  rows="3"
                  value={movieForm.description}
                  onChange={e => setMovieForm({...movieForm, description: e.target.value})}
                  className="w-full bg-slate-900 p-3 rounded-xl border border-slate-800 text-white focus:outline-none"
                />
              </div>

              <button type="submit" className="w-full btn-primary py-3.5 justify-center font-bold">
                Save & Publish Movie
              </button>
            </form>
          </div>
        )}

        {/* Tab 3: Schedule Shows */}
        {activeTab === 'shows' && (
          <div className="glass-panel p-8 rounded-3xl border border-slate-800 max-w-xl mx-auto space-y-6">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <PlusCircle className="w-6 h-6 text-amber-400" /> Schedule Movie Show
            </h3>

            <form onSubmit={handleCreateShow} className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-400 mb-1">Movie ID</label>
                <input
                  type="number"
                  required
                  value={showForm.movie_id}
                  onChange={e => setShowForm({...showForm, movie_id: Number(e.target.value)})}
                  className="w-full bg-slate-900 p-3 rounded-xl border border-slate-800 text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Screen ID</label>
                <input
                  type="number"
                  required
                  value={showForm.screen_id}
                  onChange={e => setShowForm({...showForm, screen_id: Number(e.target.value)})}
                  className="w-full bg-slate-900 p-3 rounded-xl border border-slate-800 text-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-400 mb-1">Show Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={showForm.show_time}
                    onChange={e => setShowForm({...showForm, show_time: e.target.value})}
                    className="w-full bg-slate-900 p-3 rounded-xl border border-slate-800 text-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 mb-1">Ticket Base Price (₹)</label>
                  <input
                    type="number"
                    required
                    value={showForm.price}
                    onChange={e => setShowForm({...showForm, price: Number(e.target.value)})}
                    className="w-full bg-slate-900 p-3 rounded-xl border border-slate-800 text-white focus:outline-none"
                  />
                </div>
              </div>

              <button type="submit" className="w-full btn-primary py-3.5 justify-center font-bold">
                Schedule Show
              </button>
            </form>
          </div>
        )}

        {/* Tab 4: Audit Logs */}
        {activeTab === 'logs' && (
          <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center justify-between">
              <span className="flex items-center gap-2"><Activity className="w-5 h-5 text-purple-400" /> Real-time System Audit Logs</span>
              <button onClick={fetchAdminData} className="p-1 text-gray-400 hover:text-white"><RefreshCw className="w-4 h-4" /></button>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-gray-300">
                <thead className="bg-slate-900 text-gray-400 uppercase font-semibold">
                  <tr>
                    <th className="p-3">ID</th>
                    <th className="p-3">Action</th>
                    <th className="p-3">Entity</th>
                    <th className="p-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                  {logs.map(l => (
                    <tr key={l.audit_id} className="hover:bg-slate-900/40">
                      <td className="p-3 text-amber-400">#{l.audit_id}</td>
                      <td className="p-3 font-bold text-white">{l.action}</td>
                      <td className="p-3 text-purple-400">{l.entity}</td>
                      <td className="p-3 text-gray-400">{new Date(l.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 5: Users */}
        {activeTab === 'users' && (
          <div className="glass-panel p-6 rounded-3xl border border-slate-800 space-y-4">
            <h3 className="text-lg font-bold text-white">Registered Users & Role Management</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left text-gray-300">
                <thead className="bg-slate-900 text-gray-400 uppercase font-semibold">
                  <tr>
                    <th className="p-3">User ID</th>
                    <th className="p-3">Full Name</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {userList.map(u => (
                    <tr key={u.user_id} className="hover:bg-slate-900/40">
                      <td className="p-3 font-mono text-gray-500">#{u.user_id}</td>
                      <td className="p-3 font-bold text-white">{u.full_name}</td>
                      <td className="p-3 text-gray-400">{u.email}</td>
                      <td className="p-3">
                        <span className={`badge ${u.role === 'Admin' ? 'badge-gold' : 'badge-purple'}`}>
                          {u.role}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};
