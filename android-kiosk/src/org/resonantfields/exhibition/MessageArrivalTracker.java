package org.resonantfields.exhibition;

import java.util.LinkedHashSet;
import java.util.List;

/** Suppress history on connection/reload, and alert once per new incoming message. */
public final class MessageArrivalTracker {
    private final LinkedHashSet<String> seen = new LinkedHashSet<>();
    private boolean synchronizedOnce;

    public void reconnect() { synchronizedOnce=false; }

    public int receive(List<String> incomingKeys) {
        int arrivals=0;
        for(String key:incomingKeys)if(seen.add(key) && synchronizedOnce)arrivals++;
        synchronizedOnce=true;
        // A whole loop has 25 incoming messages; keep ample recent history, bounded.
        while(seen.size()>256)seen.remove(seen.iterator().next());
        return arrivals;
    }
}
