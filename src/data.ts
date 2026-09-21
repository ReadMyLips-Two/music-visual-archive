export type Track = {
  id: string
  title: string
  duration: string
  note: string
}

export type Album = {
  id: string
  title: string
  artist: string
  year: number
  genre: string
  color: string
  note: string
  tracks: Track[]
}

// 全部专辑、艺人和曲目均为虚构演示数据，不提供音频。
export const albums: Album[] = [
  {
    id: 'slow-light', title: 'Slow Light', artist: 'Imaginary Rooms',
    year: 2024, genre: 'Ambient', color: '#dce5db',
    note: '演示档案笔记：用缓慢移动的光线与留白，记录一个安静的下午。',
    tracks: [
      { id: 'window-study', title: 'Window Study', duration: '4:12', note: '光线落在窗边，纹理逐渐展开。' },
      { id: 'after-rain', title: 'After Rain', duration: '5:08', note: '雨后的空间与细小回声。' },
    ],
  },
  {
    id: 'night-grid', title: 'Night Grid', artist: 'Paper Signals',
    year: 2025, genre: 'Electronic', color: '#dce1ec',
    note: '演示档案笔记：城市夜行的重复节奏，转译为网格与层叠线条。',
    tracks: [
      { id: 'last-train', title: 'Last Train', duration: '3:46', note: '重复的线条与远处的城市灯光。' },
      { id: 'blue-crossing', title: 'Blue Crossing', duration: '4:35', note: '交错的节拍构成一张夜间地图。' },
    ],
  },
  {
    id: 'paper-garden', title: 'Paper Garden', artist: 'Sunday Sketches',
    year: 2023, genre: 'Indie', color: '#ecdfd3',
    note: '演示档案笔记：将日常碎片收集成温暖、略显粗糙的纸上花园。',
    tracks: [
      { id: 'small-things', title: 'Small Things', duration: '3:21', note: '一页关于微小日常的手写记录。' },
      { id: 'folded-sky', title: 'Folded Sky', duration: '4:02', note: '折叠的纸张，也像一片天空。' },
    ],
  },
]
