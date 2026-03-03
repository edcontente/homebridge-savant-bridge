require 'socket'
require 'cgi'
require 'thread'

SCLIBRIDGE = '/usr/local/bin/sclibridge'
LISTEN_PORT = 12000
MAX_CONCURRENT = 3

ENV['LD_LIBRARY_PATH'] = '/usr/local/lib:/usr/lib'

# Semaphore to limit concurrent sclibridge processes
$semaphore = Mutex.new
$slots = MAX_CONCURRENT
$slots_cond = ConditionVariable.new

def acquire_slot
  $semaphore.synchronize do
    while $slots <= 0
      $slots_cond.wait($semaphore)
    end
    $slots -= 1
  end
end

def release_slot
  $semaphore.synchronize do
    $slots += 1
    $slots_cond.signal
  end
end

# Cache for readstate results (TTL 2 seconds)
$cache = {}
$cache_mutex = Mutex.new
CACHE_TTL = 2

def run_scli(command)
  # Check cache for readstate commands
  if command.start_with?('readstate ')
    $cache_mutex.synchronize do
      entry = $cache[command]
      if entry && (Time.now - entry[:time]) < CACHE_TTL
        return entry[:value]
      end
    end
  end

  acquire_slot
  begin
    output = `LD_LIBRARY_PATH=/usr/local/lib:/usr/lib #{SCLIBRIDGE} #{command} 2>&1`.strip

    # Cache readstate results
    if command.start_with?('readstate ')
      $cache_mutex.synchronize do
        $cache[command] = { value: output, time: Time.now }
      end
    end

    output
  rescue => e
    $stderr.puts "SCLI_ERR: #{e.message}"
    ''
  ensure
    release_slot
  end
end

server = TCPServer.new('0.0.0.0', LISTEN_PORT)
$stdout.puts "=== Savant Bridge listening on 0.0.0.0:#{LISTEN_PORT} (sclibridge, max #{MAX_CONCURRENT} concurrent) ==="
$stdout.flush

loop do
  Thread.start(server.accept) do |client|
    begin
      request = client.gets.to_s
      if request =~ /GET \/(\S+)\s+HTTP/i
        raw_path = CGI.unescape($1).strip
        $stdout.puts "CMD: #{raw_path}"
        $stdout.flush

        val = run_scli(raw_path)
        $stdout.puts "RSP: #{val}" unless val.empty?
        $stdout.flush

        client.print "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nConnection: close\r\nContent-Length: #{val.length}\r\n\r\n#{val}"
      else
        body = 'OK'
        client.print "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nConnection: close\r\nContent-Length: #{body.length}\r\n\r\n#{body}"
      end
    rescue => e
      $stderr.puts "THREAD_ERR: #{e.message}"
    ensure
      client.close rescue nil
    end
  end
end
