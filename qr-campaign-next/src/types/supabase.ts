export type Database = {
  public: {
    Tables: {
      Campaigns: {
        Row: Campaign;
        Insert: Omit<Campaign, 'id' | 'created_at'>;
      };
      Flyers: {
        Row: Flyer;
        Insert: Omit<Flyer, 'id' | 'created_at'>;
      };
      Scans: {
        Row: Scan;
        Insert: Omit<Scan, 'id' | 'scan_time'>;
      };
    };
  };
};

export interface Campaign {
  id: string;
  created_at: string;
  name: string;
  url: string;
  pdf_url: string;
  flyers: number;
  scans: number;
  user: string;
  Flyers?: Flyer[];
}

export interface Flyer {
  id: string;
  created_at: string;
  posted_at: string | null;
  campaign: string;
  scans: number | null;
  lat: number | null;
  long: number | null;
  url: string | null;
  pdf_url: string | null;
  s3_key: string | null;
}

export interface Scan {
  id: string;
  scan_time: string;
  flyer: string;
  campaign: string;
  lat: number | null;
  long: number | null;
} 