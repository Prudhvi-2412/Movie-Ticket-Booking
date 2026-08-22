/**
 * Seed content for CineWave.
 *
 * Poster/backdrop art comes from picsum.photos with a stable per-movie seed,
 * so every image URL resolves deterministically and forever without hotlinking
 * copyrighted studio artwork. Swap POSTER_BASE for a real CDN in production.
 */

const POSTER = (seed) => `https://picsum.photos/seed/${seed}/400/600`;
const BACKDROP = (seed) => `https://picsum.photos/seed/${seed}-bd/1600/900`;

const locations = [
  { city: 'Hyderabad', state: 'Telangana' },
  { city: 'Bengaluru', state: 'Karnataka' },
  { city: 'Chennai', state: 'Tamil Nadu' },
  { city: 'Mumbai', state: 'Maharashtra' },
  { city: 'Delhi', state: 'Delhi' },
  { city: 'Pune', state: 'Maharashtra' },
  { city: 'Kolkata', state: 'West Bengal' },
  { city: 'Kochi', state: 'Kerala' }
];

const theatres = [
  {
    city: 'Hyderabad',
    name: 'AMB Cinemas',
    location: 'Gachibowli',
    address: 'Sattva Knowledge City, Gachibowli, Hyderabad 500081',
    contact_phone: '+91 40 4455 6677',
    facilities: ['Dolby Atmos', 'Recliners', 'Valet Parking', 'Gourmet Cafe', 'Wheelchair Access'],
    screens: [
      { screen_number: 1, name: 'Audi 1', screen_type: 'IMAX', layout: 'large' },
      { screen_number: 2, name: 'Audi 2', screen_type: 'Premium', layout: 'standard' },
      { screen_number: 3, name: 'Audi 3', screen_type: 'Recliner', layout: 'recliner' }
    ]
  },
  {
    city: 'Hyderabad',
    name: 'PVR Nexus',
    location: 'Kukatpally',
    address: 'Nexus Mall, KPHB Phase 1, Kukatpally, Hyderabad 500072',
    contact_phone: '+91 40 6677 8899',
    facilities: ['4K Laser Projection', 'Dolby 7.1', 'Food Court', 'Parking'],
    screens: [
      { screen_number: 1, name: 'Screen 1', screen_type: 'Standard', layout: 'standard' },
      { screen_number: 2, name: 'Screen 2', screen_type: 'Standard', layout: 'standard' }
    ]
  },
  {
    city: 'Bengaluru',
    name: 'INOX Forum Mall',
    location: 'Koramangala',
    address: 'Forum Mall, Hosur Road, Koramangala, Bengaluru 560029',
    contact_phone: '+91 80 4090 1122',
    facilities: ['Dolby Atmos', 'Recliners', 'Parking', 'Cafe'],
    screens: [
      { screen_number: 1, name: 'Audi 1', screen_type: 'Premium', layout: 'standard' },
      { screen_number: 2, name: 'Audi 2', screen_type: 'Standard', layout: 'standard' }
    ]
  },
  {
    city: 'Bengaluru',
    name: 'Cinepolis Orion',
    location: 'Rajajinagar',
    address: 'Orion Mall, Brigade Gateway, Rajajinagar, Bengaluru 560055',
    contact_phone: '+91 80 2233 4455',
    facilities: ['4DX', 'Dolby Atmos', 'Parking', 'Wheelchair Access'],
    screens: [{ screen_number: 1, name: 'Audi 1', screen_type: '4DX', layout: 'standard' }]
  },
  {
    city: 'Chennai',
    name: 'Sathyam Cinemas',
    location: 'Royapettah',
    address: 'Thiruvika Road, Royapettah, Chennai 600014',
    contact_phone: '+91 44 4224 4224',
    facilities: ['Dolby Atmos', 'Cafe', 'Wheelchair Access'],
    screens: [
      { screen_number: 1, name: 'Screen 1', screen_type: 'Premium', layout: 'standard' },
      { screen_number: 2, name: 'Screen 2', screen_type: 'Standard', layout: 'standard' }
    ]
  },
  {
    city: 'Mumbai',
    name: 'PVR Phoenix Palladium',
    location: 'Lower Parel',
    address: 'Phoenix Palladium, Senapati Bapat Marg, Lower Parel, Mumbai 400013',
    contact_phone: '+91 22 6180 1234',
    facilities: ['IMAX', 'Dolby Atmos', 'Recliners', 'Valet Parking'],
    screens: [
      { screen_number: 1, name: 'IMAX', screen_type: 'IMAX', layout: 'large' },
      { screen_number: 2, name: 'Audi 2', screen_type: 'Recliner', layout: 'recliner' }
    ]
  },
  {
    city: 'Delhi',
    name: 'PVR Select Citywalk',
    location: 'Saket',
    address: 'Select Citywalk, District Centre, Saket, New Delhi 110017',
    contact_phone: '+91 11 4056 7788',
    facilities: ['Dolby Atmos', 'Recliners', 'Parking'],
    screens: [{ screen_number: 1, name: 'Audi 1', screen_type: 'Premium', layout: 'standard' }]
  },
  {
    city: 'Pune',
    name: 'City Pride Kothrud',
    location: 'Kothrud',
    address: 'Satara Road, Kothrud, Pune 411038',
    contact_phone: '+91 20 2544 9900',
    facilities: ['Dolby 7.1', 'Parking', 'Snack Bar'],
    screens: [{ screen_number: 1, name: 'Screen 1', screen_type: 'Standard', layout: 'standard' }]
  }
];

/**
 * Seat layouts. Row letters are generated A, B, C...; `premiumRows` and
 * `goldRows` are counted from the screen (front) backwards.
 */
const seatLayouts = {
  standard: { rows: 8, seatsPerRow: 12, aisleAfter: [4, 8], plan: ['Platinum', 'Platinum', 'Gold', 'Gold', 'Gold', 'Silver', 'Silver', 'Silver'] },
  large: { rows: 10, seatsPerRow: 16, aisleAfter: [5, 11], plan: ['Platinum', 'Platinum', 'Platinum', 'Gold', 'Gold', 'Gold', 'Gold', 'Silver', 'Silver', 'Silver'] },
  recliner: { rows: 5, seatsPerRow: 8, aisleAfter: [4], plan: ['Recliner', 'Recliner', 'Platinum', 'Platinum', 'Gold'] }
};

const movies = [
  {
    title: 'Echoes of Tomorrow',
    description:
      'A quantum physicist discovers that every message she sends into the past rewrites a stranger she has never met. As the timelines fold in on each other, she must decide which version of the world is worth keeping.',
    genre: 'Sci-Fi',
    language: 'English',
    duration_minutes: 148,
    certificate: 'UA',
    release_date: '2026-08-14',
    rating: 8.6,
    director: 'Meera Raghavan',
    cast_list: 'Anjali Menon, Rohan Kapoor, Yusuf Ali, Priya Deshpande',
    status: 'NowShowing',
    seed: 'echoes'
  },
  {
    title: 'Monsoon Lines',
    description:
      'Two railway signalmen on opposite ends of a flooded Konkan line keep a decades-long friendship alive over telegraph clicks, without ever meeting face to face.',
    genre: 'Drama',
    language: 'Marathi',
    duration_minutes: 132,
    certificate: 'U',
    release_date: '2026-07-31',
    rating: 8.9,
    director: 'Sudhir Kulkarni',
    cast_list: 'Nana Vaidya, Shalini Joshi, Ketan More',
    status: 'NowShowing',
    seed: 'monsoon'
  },
  {
    title: 'The Last Ledger',
    description:
      'A forensic accountant in Hyderabad stumbles onto a shell-company trail that leads straight into the state treasury — and every auditor who came before her has vanished.',
    genre: 'Thriller',
    language: 'Telugu',
    duration_minutes: 156,
    certificate: 'UA',
    release_date: '2026-08-07',
    rating: 8.2,
    director: 'Vamsi Krishna',
    cast_list: 'Sruthi Varma, Aditya Rao, Bhanu Prakash',
    status: 'NowShowing',
    seed: 'ledger'
  },
  {
    title: 'Paper Kites',
    description:
      'A Chennai schoolteacher enters her students into a national kite-flying championship, armed with nothing but recycled newspaper and stubborn optimism.',
    genre: 'Family',
    language: 'Tamil',
    duration_minutes: 124,
    certificate: 'U',
    release_date: '2026-08-21',
    rating: 8.4,
    director: 'Lakshmi Subramaniam',
    cast_list: 'Revathi Iyer, Karthik Balan, Deepa Nair',
    status: 'NowShowing',
    seed: 'kites'
  },
  {
    title: 'Steel Monsoon',
    description:
      'A decommissioned naval engineer is pulled back for one last salvage operation in the Bay of Bengal, where the wreck they are sent to recover should not exist.',
    genre: 'Action',
    language: 'Hindi',
    duration_minutes: 161,
    certificate: 'A',
    release_date: '2026-08-01',
    rating: 7.9,
    director: 'Imtiaz Qureshi',
    cast_list: 'Vikram Sethi, Naina Bose, Arjun Malhotra, Zoya Khan',
    status: 'NowShowing',
    seed: 'steel'
  },
  {
    title: 'The Cartographer',
    description:
      'An ageing mapmaker walks the length of the Western Ghats to draw one final atlas, and finds the villages he charted as a young man have quietly disappeared.',
    genre: 'Drama',
    language: 'Kannada',
    duration_minutes: 139,
    certificate: 'U',
    release_date: '2026-08-18',
    rating: 8.7,
    director: 'Girish Hegde',
    cast_list: 'Ramesh Bhat, Anusha Gowda, Prakash Shetty',
    status: 'NowShowing',
    seed: 'cartographer'
  },
  {
    title: 'Neon Bazaar',
    description:
      'In a near-future Mumbai where memories are traded like currency, a black-market broker takes on a client who wants to buy back a childhood that was never hers.',
    genre: 'Sci-Fi',
    language: 'Hindi',
    duration_minutes: 144,
    certificate: 'UA',
    release_date: '2026-09-11',
    rating: 8.1,
    director: 'Farah Siddiqui',
    cast_list: 'Ishaan Grover, Tara Menon, Rustom Batliwala',
    status: 'ComingSoon',
    seed: 'bazaar'
  },
  {
    title: 'Midnight at Marine Drive',
    description:
      'Six strangers share a taxi through a Mumbai night that refuses to end, each carrying a secret the others are about to need.',
    genre: 'Mystery',
    language: 'Hindi',
    duration_minutes: 128,
    certificate: 'UA',
    release_date: '2026-09-25',
    rating: 7.6,
    director: 'Rhea Dsouza',
    cast_list: 'Sanjay Pillai, Amrita Roy, Faisal Sheikh',
    status: 'ComingSoon',
    seed: 'marine'
  },
  {
    title: 'Harvest Moon Rising',
    description:
      'A Punjab farming collective fights a season of drought with an irrigation scheme designed by a teenager who has never left the village.',
    genre: 'Drama',
    language: 'Punjabi',
    duration_minutes: 137,
    certificate: 'U',
    release_date: '2026-10-02',
    rating: 8.3,
    director: 'Harpreet Sandhu',
    cast_list: 'Gurdeep Singh, Simran Kaur, Baljeet Dhillon',
    status: 'ComingSoon',
    seed: 'harvest'
  },
  {
    title: 'Salt and Stone',
    description:
      'A Kochi fisherwoman takes the state to court over a disappearing coastline, and turns a small claims hearing into a national reckoning.',
    genre: 'Drama',
    language: 'Malayalam',
    duration_minutes: 142,
    certificate: 'UA',
    release_date: '2026-06-19',
    rating: 8.8,
    director: 'Thomas Varghese',
    cast_list: 'Maya Pillai, Joseph Kurian, Anitha Menon',
    status: 'NowShowing',
    seed: 'salt'
  }
].map((m) => ({
  ...m,
  poster_url: POSTER(m.seed),
  banner_url: BACKDROP(m.seed),
  // Public domain "Big Buck Bunny" trailer stands in for a real trailer URL.
  trailer_url: 'https://www.youtube.com/embed/aqz-KE-bpKQ'
}));

/** Showtimes are generated relative to "today" so seeded data is never stale. */
const showTimeSlots = ['10:15', '13:30', '16:45', '19:30', '22:15'];

const users = [
  { full_name: 'CineWave Admin', email: 'admin@cinewave.com', password: 'Admin@123', role: 'Admin', phone: '9800000001' },
  { full_name: 'Aarav Sharma', email: 'aarav@example.com', password: 'Customer@123', role: 'Customer', phone: '9876543210' },
  { full_name: 'Ananya Iyer', email: 'ananya@example.com', password: 'Customer@123', role: 'Customer', phone: '9123456780' },
  { full_name: 'Rohan Gupta', email: 'rohan@example.com', password: 'Customer@123', role: 'Customer', phone: '9789012345' }
];

module.exports = { locations, theatres, seatLayouts, movies, showTimeSlots, users, POSTER, BACKDROP };
