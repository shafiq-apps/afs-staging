'use client';
import { images } from '@/lib/images';
import Image from 'next/image';

export default function AnimatedBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
      {/* Soft gradient backgrounds with red, blue, pink, green, purple */}
      <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 via-blue-500/5 to-pink-500/5 animate-gradient-xy"></div>
      <div className="absolute inset-0 bg-gradient-to-tr from-green-500/4 via-purple-500/4 to-red-500/4 animate-gradient-xy-reverse"></div>
      <div className="absolute inset-0 bg-gradient-to-bl from-blue-500/3 via-pink-500/3 to-green-500/3 animate-gradient-slow"></div>
      <div className="absolute inset-0 bg-gradient-to-tl from-purple-500/4 via-red-500/4 to-blue-500/4 animate-gradient-diagonal"></div>

      {/* Moving filter symbols - traveling across screen */}
      <div className="absolute w-64 h-64 opacity-10 animate-move-1">
        <Image
          alt="Filter"
          className="w-full h-full object-contain"
          {...images.smallIcon}
        />
      </div>
      
      <div className="absolute w-48 h-48 opacity-[0.08] animate-move-2">
        <Image
          alt="Filter"
          className="w-full h-full object-contain"
          {...images.smallIcon}
        />
      </div>
      
      <div className="absolute w-56 h-56 opacity-[0.12] animate-move-3">
        <Image
          alt="Filter"
          className="w-full h-full object-contain"
          {...images.smallIcon}
        />
      </div>
      
      <div className="absolute w-40 h-40 opacity-[0.06] animate-move-4">
        <Image
          alt="Filter"
          className="w-full h-full object-contain"
          {...images.smallIcon}
        />
      </div>
      
    </div>
  );
}

