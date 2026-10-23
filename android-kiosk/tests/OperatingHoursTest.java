import org.resonantfields.exhibition.OperatingHours;
import java.time.OffsetDateTime;
public class OperatingHoursTest {
 public static void main(String[] args){
  String[] dates={"2026-10-23T12:44:59+09:00","2026-10-23T12:45:00+09:00","2026-10-23T17:59:59+09:00","2026-10-23T18:00:00+09:00","2026-10-24T00:00:00+09:00","2026-10-24T12:45:00+09:00"};
  boolean[] expected={false,true,true,false,false,true};
  for(int i=0;i<dates.length;i++)if(OperatingHours.isOpen(OffsetDateTime.parse(dates[i]).toInstant().toEpochMilli())!=expected[i])throw new AssertionError(dates[i]);
  System.out.println("PASS: Android hours match PC boundaries in Korea independent of device timezone");
 }
}
