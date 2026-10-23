package org.resonantfields.exhibition;

import android.app.Activity;
import android.app.AlertDialog;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import android.app.ActivityManager;
import android.app.KeyguardManager;
import android.content.Intent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.os.PowerManager;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.URL;
import java.util.Collections;
import java.util.ArrayList;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;
import org.json.JSONArray;

/** Native display shell; all scenes, game logic and messages stay on the PC. */
public class MainActivity extends Activity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private FrameLayout root;
    private volatile WebView web;
    private boolean exhibitionStarted;
    private final BroadcastReceiver screenReceiver=new BroadcastReceiver(){
        @Override public void onReceive(Context context,Intent intent){
            if(Intent.ACTION_SCREEN_OFF.equals(intent.getAction())){if(exhibitionStarted)suspendExhibition();}
            else resumeExhibition();
        }
    };
    private View offline;
    private TextView connectionText;
    private volatile String networkProblem="전시 PC 연결을 기다리는 중";
    private int disconnectedChecks;
    private volatile String endpoint;
    private volatile boolean closed;
    private boolean failed;
    private boolean resumed, vibrationActive;
    private int pageGeneration, pendingVibrations;
    private Vibrator vibrator;
    private String vibrationStatus="";
    private void vibrationStatus(String status){if(!status.equals(vibrationStatus)){vibrationStatus=status;android.util.Log.d("ExhibitionVibration",status);}}
    private final MessageArrivalTracker arrivals=new MessageArrivalTracker();
    private static final String MESSAGE_STATE="(()=>{const p=window.PhoneView;if(!p||!p.connected||!p.state.instance)return null;return p.messages.items.filter(m=>m.incoming&&!m.preset).map(m=>[m.sceneInstance,m.id,m.receivedAt].join(':'));})()";
    private final Runnable vibrateNext=new Runnable(){
        @Override public void run(){
            if(closed||!resumed||pendingVibrations<=0){pendingVibrations=0;vibrationActive=false;return;}
            vibrationActive=true;
            pendingVibrations--;
            if(vibrator!=null&&vibrator.hasVibrator())try{
                vibrator.vibrate(VibrationEffect.createWaveform(new long[]{0,180,100,180},-1),
                    new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            }catch(SecurityException ignored){}
            handler.postDelayed(this,650);
        }
    };
    private final Runnable observeMessages=new Runnable(){
        @Override public void run(){
            if(closed||!resumed||web==null){vibrationStatus("waiting for active WebView");return;}
            final int generation=pageGeneration;
            if(failed||!endpoint.equals(web.getUrl())){vibrationStatus("waiting for paired page");arrivals.reconnect();handler.postDelayed(this,350);return;}
            // Read only message identities from our paired page; no native JS bridge is exposed.
            web.evaluateJavascript(MESSAGE_STATE,result->{
                if(closed||!resumed||generation!=pageGeneration)return;
                try{
                    if(result==null||"null".equals(result)){vibrationStatus("waiting for connected message snapshot");arrivals.reconnect();showConnection();if(++disconnectedChecks>=60){disconnectedChecks=0;web.reload();}return;}
                    disconnectedChecks=0;offline.setVisibility(View.GONE);
                    JSONArray keys=new JSONArray(result);ArrayList<String> incoming=new ArrayList<>();
                    for(int i=0;i<keys.length();i++)incoming.add(keys.getString(i));
                    int count=arrivals.receive(incoming);
                    vibrationStatus("observing "+incoming.size()+" incoming messages; new="+count);
                    if(count>0){pendingVibrations+=count;if(!vibrationActive){vibrationActive=true;handler.post(vibrateNext);}}
                }catch(Exception error){vibrationStatus("message snapshot error: "+error.getClass().getSimpleName());arrivals.reconnect();}
            });
            handler.postDelayed(this,350);
        }
    };
    private final ScheduledExecutorService network=Executors.newSingleThreadScheduledExecutor();
    private final Runnable retry = () -> { if (web != null && failed) web.loadUrl(endpoint); };

    public static boolean validEndpoint(String value) {
        try {
            Uri u=Uri.parse(value);
            if (!("http".equals(u.getScheme()) || "https".equals(u.getScheme())) ||
                !"/phone.html".equals(u.getPath()) || u.getUserInfo()!=null) return false;
            String[] parts=u.getHost().split("\\.");
            if(parts.length!=4)return false;
            int[] octets=new int[4];
            for(int i=0;i<4;i++){octets[i]=Integer.parseInt(parts[i]);if(octets[i]<0||octets[i]>255)return false;}
            boolean local=octets[0]==10 || (octets[0]==192&&octets[1]==168) ||
                (octets[0]==172&&octets[1]>=16&&octets[1]<=31) ||
                (octets[0]==100&&octets[1]>=64&&octets[1]<=127);
            String key=u.getQueryParameter("key");
            return local && key!=null && key.matches("[a-f0-9]{12,64}");
        } catch(Exception e){return false;}
    }

    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        vibrator=(Vibrator)getSystemService(VIBRATOR_SERVICE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WindowManager.LayoutParams display=getWindow().getAttributes();
        display.screenBrightness=0.55f;
        getWindow().setAttributes(display);
        root=new FrameLayout(this);root.setBackgroundColor(Color.rgb(16,19,24));setContentView(root);
        endpoint=getPreferences(MODE_PRIVATE).getString("endpoint","");
        String supplied=getIntent().getStringExtra("url");
        if(supplied!=null && validEndpoint(supplied)){endpoint=supplied;saveEndpoint();}
        exhibitionStarted=state!=null&&state.getBoolean("exhibitionStarted",false)&&validEndpoint(endpoint);
        if(exhibitionStarted)allowExhibitionOverLock();
        else if(validEndpoint(endpoint))showStart();else showSetup();
        IntentFilter screenEvents=new IntentFilter(Intent.ACTION_SCREEN_OFF);
        screenEvents.addAction(Intent.ACTION_SCREEN_ON);
        registerReceiver(screenReceiver,screenEvents);
        immersive();
        network.scheduleWithFixedDelay(this::checkConnection,5,5,TimeUnit.SECONDS);
    }

    private void saveEndpoint(){getPreferences(MODE_PRIVATE).edit().putString("endpoint",endpoint).apply();}
    private LinearLayout panel(){
        root.removeAllViews();LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(32,64,32,32);root.addView(box,new FrameLayout.LayoutParams(-1,-1));return box;
    }
    private TextView label(String text){TextView v=new TextView(this);v.setText(text);v.setTextSize(18);v.setTextColor(Color.WHITE);v.setPadding(0,16,0,16);return v;}
    private void showSetup(){
        LinearLayout box=panel();box.addView(label("전시 PC의 모바일 접속 주소"));
        EditText input=new EditText(this);input.setSingleLine(true);input.setInputType(17);input.setText(endpoint);box.addView(input);
        TextView error=label("");box.addView(error);
        Button connect=new Button(this);connect.setText("연결");box.addView(connect);
        connect.setOnClickListener(v->{String value=input.getText().toString().trim();
            if(!validEndpoint(value)){error.setText("전시 PC에서 받은 모바일 주소를 입력해 주세요.");return;}
            endpoint=value;saveEndpoint();showStart();});
    }
    private void showStart(){
        LinearLayout box=panel();box.addView(label("전시 모바일"));
        box.addView(label("시작 후 앱 고정 안내가 나오면 확인해 주세요. 잠금 해제에는 휴대전화의 PIN을 사용합니다."));
        KeyguardManager keyguard=(KeyguardManager)getSystemService(KEYGUARD_SERVICE);
        if(!keyguard.isDeviceSecure())box.addView(label("관객이 앱 고정을 해제하지 못하도록 휴대전화 잠금 PIN도 설정해 주세요."));
        android.app.NotificationManager notifications=(android.app.NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        if(!notifications.areNotificationsEnabled()){
            box.addView(label("문자가 올 때 진동이 울리려면 앱 알림을 허용해 주세요."));
            Button allow=new Button(this);allow.setText("문자 진동 알림 허용");box.addView(allow);
            allow.setOnClickListener(v->startActivity(new android.content.Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE,getPackageName())));
        }
        Button start=new Button(this);start.setText("전시 시작");box.addView(start);
        start.setOnClickListener(v->{exhibitionStarted=true;allowExhibitionOverLock();resumeExhibition();
            ActivityManager am=(ActivityManager)getSystemService(ACTIVITY_SERVICE);
            if(am.getLockTaskModeState()==ActivityManager.LOCK_TASK_MODE_NONE)startLockTask();});
    }
    private void checkConnection(){
        if(closed || web==null || !validEndpoint(endpoint))return;
        String original=endpoint;
        HttpURLConnection connection=null;
        try{
            Uri paired=Uri.parse(original);
            URL info=new URL(paired.buildUpon().path("/api/info").build().toString());
            connection=(HttpURLConnection)info.openConnection();connection.setConnectTimeout(1800);connection.setReadTimeout(1800);
            int code=connection.getResponseCode();
            if(code==200){networkProblem="PC에 연결됨 · 전시 화면을 불러오는 중";return;}
            networkProblem=code==403?"PC 연결 키가 맞지 않습니다. PC 접속 주소 전체를 입력해 주세요.":"PC 응답 오류: "+code;
        }catch(Exception ignored){networkProblem="PC에 연결되지 않습니다. PC가 실행 중인지, 두 기기 사이의 통신이 허용되는지 확인해 주세요.";}finally{if(connection!=null)connection.disconnect();}
        // DHCP may change the PC's LAN address. Discover only a PC with the saved pairing key.
        try(DatagramSocket socket=new DatagramSocket()){
            socket.setBroadcast(true);socket.setSoTimeout(1800);
            String nonce=UUID.randomUUID().toString();
            JSONObject request=new JSONObject().put("service","resonant-fields").put("nonce",nonce)
                .put("proof",proof(Uri.parse(original).getQueryParameter("key"),"discover:"+nonce));
            byte[] bytes=request.toString().getBytes("UTF-8");
            for(NetworkInterface nic:Collections.list(NetworkInterface.getNetworkInterfaces())){
                if(!nic.isUp() || nic.isLoopback())continue;
                for(InterfaceAddress address:nic.getInterfaceAddresses()){
                    InetAddress broadcast=address.getBroadcast();if(broadcast==null)continue;
                    socket.send(new DatagramPacket(bytes,bytes.length,broadcast,8771));
                }
            }
            byte[] response=new byte[2048];DatagramPacket packet=new DatagramPacket(response,response.length);socket.receive(packet);
            JSONObject reply=new JSONObject(new String(packet.getData(),0,packet.getLength(),"UTF-8"));
            if(!"resonant-fields".equals(reply.optString("service")) || !nonce.equals(reply.optString("nonce")))return;
            int port=reply.getInt("port");if(port<1024 || port>65535)return;
            if(!proof(Uri.parse(original).getQueryParameter("key"),"reply:"+nonce+":"+port).equals(reply.optString("proof")))return;
            String found=Uri.parse(original).buildUpon().encodedAuthority(packet.getAddress().getHostAddress()+":"+port).build().toString();
            if(!validEndpoint(found)||found.equals(original))return;
            runOnUiThread(()->{if(!closed && web!=null && endpoint.equals(original)){
                endpoint=found;saveEndpoint();web.loadUrl(endpoint);
            }});
        }catch(Exception ignored){}
    }
    // Show only the exhibition above the lock screen; Android settings remain PIN protected.
    // Never use TURN_SCREEN_ON: only the physical button should wake the display.
    private void allowExhibitionOverLock(){
        if(android.os.Build.VERSION.SDK_INT>=27)setShowWhenLocked(true);
        else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED);
    }
    private void resumeExhibition(){
        PowerManager power=(PowerManager)getSystemService(POWER_SERVICE);
        if(closed||!resumed||!exhibitionStarted||!power.isInteractive()||web!=null)return;
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        openExhibition();
    }
    private void suspendExhibition(){
        pageGeneration++;arrivals.reconnect();
        handler.removeCallbacks(observeMessages);handler.removeCallbacks(vibrateNext);handler.removeCallbacks(retry);
        pendingVibrations=0;vibrationActive=false;if(vibrator!=null)vibrator.cancel();
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // Destroy the page to stop video, WebAudio, timers and requests together.
        // The PC owns progress; a fresh page on wake joins its current scene.
        WebView old=web;web=null;
        if(old!=null){root.removeView(old);old.setKeepScreenOn(false);old.stopLoading();old.onPause();old.destroy();}
        root.removeAllViews();
    }
    private static String proof(String key,String value) throws Exception {
        Mac mac=Mac.getInstance("HmacSHA256");mac.init(new SecretKeySpec(key.getBytes("UTF-8"),"HmacSHA256"));
        StringBuilder hex=new StringBuilder();for(byte b:mac.doFinal(value.getBytes("UTF-8")))hex.append(String.format("%02x",b&255));return hex.toString();
    }
    private void showConnection(){
        if(offline==null||web==null)return;
        android.util.Log.w("ExhibitionConnection",networkProblem);
        connectionText.setText(networkProblem+"\n\nPC 주소: "+Uri.parse(endpoint).getHost()+"\n자동으로 재연결을 시도하고 있습니다.");
        offline.setVisibility(View.VISIBLE);
    }
    private void editAddress(){
        EditText input=new EditText(this);input.setSingleLine(true);input.setText(Uri.parse(endpoint).getHost());
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle("PC 주소 설정")
            .setMessage("PC의 IPv4 주소 또는 모바일 접속 주소 전체를 입력하세요.")
            .setView(input).setNegativeButton("취소",null).setPositiveButton("연결",null).create();
        dialog.setOnShowListener(v->dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(button->{
            String text=input.getText().toString().trim();String candidate=text.contains("://")?text:
                Uri.parse(endpoint).buildUpon().encodedAuthority(text+":"+(Uri.parse(endpoint).getPort()>0?Uri.parse(endpoint).getPort():8770)).build().toString();
            if(!validEndpoint(candidate)){input.setError("올바른 PC 주소를 입력하세요.");return;}
            endpoint=candidate;saveEndpoint();networkProblem="새 PC 주소에 연결하는 중";if(web!=null){showConnection();web.loadUrl(endpoint);}dialog.dismiss();
        }));dialog.show();
    }
    private void openExhibition(){
        root.removeAllViews();disconnectedChecks=0;WebView.setWebContentsDebuggingEnabled(getIntent().getBooleanExtra("diagnostics",false));web=new WebView(this);web.setBackgroundColor(Color.rgb(16,19,24));web.setKeepScreenOn(true);
        WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);
        settings.setSupportZoom(false);settings.setBuiltInZoomControls(false);settings.setDisplayZoomControls(false);
        settings.setSupportMultipleWindows(false);settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        web.setOnLongClickListener(v->true);web.setLongClickable(false);
        web.setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                // Never leave the paired phone page or open another application.
                return !endpoint.equals(request.getUrl().toString());
            }
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon){if(view!=web)return;failed=false;pageGeneration++;arrivals.reconnect();}
            @Override public void onPageFinished(WebView view,String url){
                if(view==web&&!failed){handler.removeCallbacks(retry);immersive();}
            }
            @Override public void onReceivedError(WebView view,WebResourceRequest req,WebResourceError err){
                if(view!=web||!req.isForMainFrame())return;failed=true;networkProblem="PC 연결 오류: "+err.getErrorCode();showConnection();
                handler.removeCallbacks(retry);handler.postDelayed(retry,5000);
            }
        });
        root.addView(web,new FrameLayout.LayoutParams(-1,-1));
        LinearLayout panel=new LinearLayout(this);panel.setOrientation(LinearLayout.VERTICAL);panel.setGravity(17);panel.setPadding(40,40,40,40);
        panel.setBackgroundColor(Color.rgb(16,19,24));connectionText=label("");panel.addView(connectionText);
        Button retryButton=new Button(this);retryButton.setText("다시 연결");panel.addView(retryButton);
        retryButton.setOnClickListener(v->{if(web!=null){networkProblem="다시 연결하는 중";showConnection();web.loadUrl(endpoint);}});
        Button address=new Button(this);address.setText("PC 주소 설정");panel.addView(address);address.setOnClickListener(v->editAddress());
        // Diagnostic UI requires an explicit operator launch flag.
        FrameLayout cover=new FrameLayout(this);cover.setBackgroundColor(Color.rgb(16,19,24));
        panel.setVisibility(View.GONE);cover.addView(panel,new FrameLayout.LayoutParams(-1,-1));
        if(getIntent().getBooleanExtra("diagnostics",false))panel.setVisibility(View.VISIBLE);
        offline=cover;root.addView(offline,new FrameLayout.LayoutParams(-1,-1));showConnection();web.loadUrl(endpoint);immersive();
        handler.removeCallbacks(observeMessages);handler.post(observeMessages);
    }
    private void immersive(){getWindow().getDecorView().setSystemUiVisibility(
        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY|View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|
        View.SYSTEM_UI_FLAG_LAYOUT_STABLE|View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN|View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);}
    @Override public void onWindowFocusChanged(boolean focus){super.onWindowFocusChanged(focus);if(focus)immersive();}
    @Override public void onResume(){super.onResume();resumed=true;immersive();resumeExhibition();}
    @Override public void onSaveInstanceState(Bundle state){state.putBoolean("exhibitionStarted",exhibitionStarted);super.onSaveInstanceState(state);}
    @Override public void onPause(){resumed=false;if(exhibitionStarted)suspendExhibition();super.onPause();}
    @Override public void onBackPressed(){if(web!=null){web.evaluateJavascript("document.activeElement && document.activeElement.blur()",null);immersive();}}
    @Override public void onDestroy(){closed=true;unregisterReceiver(screenReceiver);network.shutdownNow();handler.removeCallbacksAndMessages(null);if(vibrator!=null)vibrator.cancel();if(web!=null){web.stopLoading();web.destroy();}super.onDestroy();}
}
