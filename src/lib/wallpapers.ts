export interface Wallpaper {
  id: string;
  name: string;
  category: string;
  url: string;
  thumb: string;
  fallback: string;
}

export const STOCK_WALLPAPERS: Wallpaper[] = [
  {
    id: 'sakura-shrine',
    name: 'Sakura Shrine',
    category: 'Traditional Japan',
    url: 'https://images.unsplash.com/photo-1528164344705-475426879c0d?auto=format&fit=crop&w=2000&q=80',
    thumb: 'https://images.unsplash.com/photo-1528164344705-475426879c0d?auto=format&fit=crop&w=400&q=80',
    fallback: 'linear-gradient(135deg, #2b1028 0%, #7b1e42 50%, #d85c7a 100%)'
  },
  {
    id: 'shibuya-neon',
    name: 'Shibuya Cyber Neon',
    category: 'Cyberpunk Tokyo',
    url: 'https://images.unsplash.com/photo-1542051841857-5f90071e7989?auto=format&fit=crop&w=2000&q=80',
    thumb: 'https://images.unsplash.com/photo-1542051841857-5f90071e7989?auto=format&fit=crop&w=400&q=80',
    fallback: 'linear-gradient(135deg, #070014 0%, #1f0438 40%, #00d2d3 80%, #ff007f 100%)'
  },
  {
    id: 'fuji-pagoda',
    name: 'Mt. Fuji & Pagoda',
    category: 'Iconic Japan',
    url: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=2000&q=80',
    thumb: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=400&q=80',
    fallback: 'linear-gradient(135deg, #101935 0%, #3b2c65 45%, #f37b67 85%, #fec882 100%)'
  },
  {
    id: 'rainy-tokyo',
    name: 'Rainy Night in Shinjuku',
    category: 'Lo-Fi Rain',
    url: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=2000&q=80',
    thumb: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=400&q=80',
    fallback: 'linear-gradient(135deg, #090e17 0%, #182638 50%, #294e6b 100%)'
  },
  {
    id: 'kyoto-torii',
    name: 'Fushimi Inari Torii',
    category: 'Kyoto Sanctuary',
    url: 'https://images.unsplash.com/photo-1478436127897-769e00d2c715?auto=format&fit=crop&w=2000&q=80',
    thumb: 'https://images.unsplash.com/photo-1478436127897-769e00d2c715?auto=format&fit=crop&w=400&q=80',
    fallback: 'linear-gradient(135deg, #1f0b09 0%, #681f14 50%, #e04a28 100%)'
  },
  {
    id: 'arashiyama-bamboo',
    name: 'Arashiyama Bamboo Grove',
    category: 'Kyoto Nature',
    url: 'https://images.unsplash.com/photo-1509099836639-18ba1795216d?auto=format&fit=crop&w=2000&q=80',
    thumb: 'https://images.unsplash.com/photo-1509099836639-18ba1795216d?auto=format&fit=crop&w=400&q=80',
    fallback: 'linear-gradient(135deg, #0b1a13 0%, #173827 50%, #2f6b4f 100%)'
  },
  {
    id: 'anime-starry-sky',
    name: 'Anime Starry Night',
    category: 'Anime Aesthetic',
    url: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=2000&q=80',
    thumb: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=400&q=80',
    fallback: 'linear-gradient(135deg, #06091f 0%, #151b47 45%, #3d2361 75%, #814674 100%)'
  },
  {
    id: 'cozy-lofi-room',
    name: 'Cozy Lo-Fi Sunset',
    category: 'Anime Room',
    url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=2000&q=80',
    thumb: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=400&q=80',
    fallback: 'linear-gradient(135deg, #241429 0%, #542247 45%, #9b3d58 75%, #e27d60 100%)'
  },
  {
    id: 'lake-kawaguchi-sakura',
    name: 'Sakura Lake Kawaguchi',
    category: 'Spring Fuji',
    url: 'https://images.unsplash.com/photo-1525635569544-610f9540664a?auto=format&fit=crop&w=2000&q=80',
    thumb: 'https://images.unsplash.com/photo-1525635569544-610f9540664a?auto=format&fit=crop&w=400&q=80',
    fallback: 'linear-gradient(135deg, #210b2d 0%, #702f52 45%, #e18a98 80%, #fde6ec 100%)'
  },
  {
    id: 'tokyo-lantern-twilight',
    name: 'Tokyo Lantern Twilight',
    category: 'Neon Shibuya',
    url: 'https://images.unsplash.com/photo-1758400757795-3edf61faef52?auto=format&fit=crop&w=2000&q=80',
    thumb: 'https://images.unsplash.com/photo-1758400757795-3edf61faef52?auto=format&fit=crop&w=400&q=80',
    fallback: 'linear-gradient(135deg, #120a1f 0%, #3b1e4f 40%, #d94a3d 80%, #ffb86b 100%)'
  },
  {
    id: 'shibuya-neon-crossing',
    name: 'Shibuya Neon Crossing',
    category: 'Neon Tokyo',
    url: 'https://images.unsplash.com/photo-1741684650296-19f452c8814f?auto=format&fit=crop&w=2000&q=80',
    thumb: 'https://images.unsplash.com/photo-1741684650296-19f452c8814f?auto=format&fit=crop&w=400&q=80',
    fallback: 'linear-gradient(135deg, #0b0620 0%, #3a1050 45%, #e0558e 80%, #5aa8ff 100%)'
  },
  {
    id: 'fuji-cherry-bloom',
    name: 'Fuji Cherry Bloom',
    category: 'Spring Fuji',
    url: 'https://images.unsplash.com/photo-1574077646797-4d41ad5d908a?auto=format&fit=crop&w=2000&q=80',
    thumb: 'https://images.unsplash.com/photo-1574077646797-4d41ad5d908a?auto=format&fit=crop&w=400&q=80',
    fallback: 'linear-gradient(135deg, #1f0d33 0%, #6b2d67 45%, #d985b8 80%, #ffe3f2 100%)'
  }
];
