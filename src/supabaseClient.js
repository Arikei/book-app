import { createClient } from '@supabase/supabase-js'

// ここにあなたのキーを入れます（後で書き換えます）
const supabaseUrl = 'https://sldcbyysdtjixksggypp.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsZGNieXlzZHRqaXhrc2dneXBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxMzc0ODAsImV4cCI6MjA4MjcxMzQ4MH0.aWP9eymfMIbHG4rWorED1GfFczdkvdiqPUv9kLET2BY'

export const supabase = createClient(supabaseUrl, supabaseKey)