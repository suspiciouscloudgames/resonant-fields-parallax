import org.resonantfields.exhibition.MessageArrivalTracker;
import java.util.Arrays;
import java.util.Collections;
public class MessageArrivalTrackerTest {
    static void expect(int actual,int expected){if(actual!=expected)throw new AssertionError(actual+" != "+expected);}
    public static void main(String[] args){
        MessageArrivalTracker t=new MessageArrivalTracker();
        expect(t.receive(Arrays.asList("old:1","old:2")),0);
        expect(t.receive(Arrays.asList("old:1","old:2")),0);
        expect(t.receive(Arrays.asList("old:1","old:2","live:3")),1);
        expect(t.receive(Arrays.asList("live:3","live:4","live:5")),2);
        expect(t.receive(Arrays.asList("old:1","old:2","live:3","live:4","live:5")),0);
        t.reconnect();expect(t.receive(Arrays.asList("live:5","offline:6")),0);
        expect(t.receive(Arrays.asList("offline:6","live:7")),1);
        expect(t.receive(Collections.emptyList()),0);
        expect(t.receive(Arrays.asList("next-loop:1")),1);
        for(int i=0;i<1000;i++)expect(t.receive(Arrays.asList("later:"+i)),1);
        expect(t.receive(Arrays.asList("later:999")),0);
        MessageArrivalTracker fresh=new MessageArrivalTracker();
        expect(fresh.receive(Collections.emptyList()),0);
        expect(fresh.receive(Arrays.asList("first-live-message")),1);
        System.out.println("PASS: initial history, new arrivals, repeated snapshots, batches, reconnect, loops, bounded memory.");
    }
}
