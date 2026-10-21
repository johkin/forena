import java.io.*;
import java.nio.file.*;
import java.sql.*;
import java.util.*;

/** Test fixtures only. Caller validates the isolated project and supplies owner credentials in env. */
class BrowserSeed {
    static Properties ids = new Properties();
    static UUID id(String key) { return UUID.fromString(ids.getProperty(key)); }
    static void execute(Connection db, String sql, Object... values) throws SQLException {
        try (var s = db.prepareStatement(sql)) {
            for (int i=0; i<values.length; i++) s.setObject(i+1,values[i]);
            s.executeUpdate();
        }
    }
    static String quote(String s) { return "\""+s.replace("\\","\\\\").replace("\"","\\\"").replace("\n","\\n").replace("\r","\\r").replace("\t","\\t")+"\""; }
    static String rows(Connection db, String sql, Object... values) throws SQLException {
        var result = new ArrayList<String>();
        try (var s = db.prepareStatement(sql)) {
            for (int i=0; i<values.length; i++) s.setObject(i+1,values[i]);
            try (var r = s.executeQuery()) {
                var meta=r.getMetaData();
                while (r.next()) {
                    var fields=new ArrayList<String>();
                    for (int i=1;i<=meta.getColumnCount();i++) {
                        Object v=r.getObject(i);
                        fields.add(quote(meta.getColumnLabel(i))+":"+(v==null?"null":v instanceof Number||v instanceof Boolean?v.toString():quote(v.toString())));
                    }
                    result.add("{"+String.join(",",fields)+"}");
                }
            }
        }
        return "["+String.join(",",result)+"]";
    }
    static void create(Connection db) throws Exception {
        for (String a:List.of("account0","account1")) execute(db,"insert into forena.account(subject) values(?)",id(a));
        execute(db,"insert into forena.organization(id,name) values(?,'Syntetisk browserförening')",id("org"));
        execute(db,"insert into forena.team(id,organization_id,name) values(?,?,'Syntetiskt browserlag')",id("team"),id("org"));
        for (String activity:List.of("activity","foreignActivity"))
            execute(db,"insert into forena.activity(id,organization_id,team_id,title,starts_at,ends_at) values(?,?,?,'Syntetisk familjeträning',now()+interval '1 hour',now()+interval '2 hours')",id(activity),id("org"),id("team"));
        String[] children={"child0","child1","foreignChild"};
        String[] names={"Syntetiskt barn Alva","Syntetiskt barn Bo","Syntetiskt barn Kim"};
        String[] invitations={"invitation0","invitation1","foreignInvitation"};
        for(int i=0;i<children.length;i++) {
            execute(db,"insert into forena.person(id,organization_id,display_name) values(?,?,?)",id(children[i]),id("org"),names[i]);
            execute(db,"insert into forena.person_access(person_id,organization_id,subject,kind) values(?,?,?,'guardian')",id(children[i]),id("org"),id(i==2?"account1":"account0"));
            execute(db,"insert into forena.invitation(id,organization_id,activity_id,person_id) values(?,?,?,?)",id(invitations[i]),id("org"),id(i==2?"foreignActivity":"activity"),id(children[i]));
        }
    }
    static void cleanup(Connection db) throws Exception {
        for(String invitation:List.of("invitation0","invitation1","foreignInvitation"))
            execute(db,"delete from forena.invitation_history where invitation_id=?",id(invitation));
        for(String activity:List.of("activity","foreignActivity")) execute(db,"delete from forena.activity_signal_state where activity_id=?",id(activity));
        for(String invitation:List.of("invitation0","invitation1","foreignInvitation")) execute(db,"delete from forena.invitation where id=?",id(invitation));
        for(String activity:List.of("activity","foreignActivity")) execute(db,"delete from forena.activity where id=?",id(activity));
        for(String person:List.of("child0","child1","foreignChild")) {
            execute(db,"delete from forena.person_access where person_id=?",id(person));
            execute(db,"delete from forena.person where id=?",id(person));
        }
        execute(db,"delete from forena.team where id=?",id("team"));
        execute(db,"delete from forena.organization where id=?",id("org"));
        for(String account:List.of("account0","account1")) {
            if(ids.getProperty(account)!=null) execute(db,"delete from forena.account where subject=?",id(account));
        }
    }
    static void snapshot(Connection db) throws Exception {
        String invitations=rows(db,"select id,response,response_comment,responded_at,revision from forena.invitation where id in (?,?,?) order by id",id("invitation0"),id("invitation1"),id("foreignInvitation"));
        String history=rows(db,"select invitation_id,actor_subject,channel,previous_response,response,revision from forena.invitation_history where invitation_id in (?,?,?) order by invitation_id,revision",id("invitation0"),id("invitation1"),id("foreignInvitation"));
        String signals=rows(db,"select activity_id,dirty_revision from forena.activity_signal_state where activity_id in (?,?) order by activity_id",id("activity"),id("foreignActivity"));
        System.out.println("{\"invitations\":"+invitations+",\"history\":"+history+",\"signals\":"+signals+"}");
    }
    public static void main(String[] args) throws Exception {
        try(var reader=Files.newBufferedReader(Path.of(args[1]))) { ids.load(reader); }
        try(var db=DriverManager.getConnection(System.getenv("FORENA_TEST_JDBC_URL"),System.getenv("FORENA_TEST_OWNER_USERNAME"),System.getenv("FORENA_TEST_OWNER_PASSWORD"))) {
            try(var s=db.createStatement();var r=s.executeQuery("select current_user,(select count(*) from forena.databasechangelog)")) {
                r.next();if(!r.getString(1).equals("forena_api_owner")||r.getInt(2)!=5) throw new Exception("Expected isolated migrated owner connection");
            }
            if(args[0].equals("snapshot")) { snapshot(db);return; }
            db.setAutoCommit(false);
            try {
                switch(args[0]) { case "create" -> create(db); case "cleanup" -> cleanup(db); default -> throw new Exception("Invalid fixture operation"); }
                db.commit();
            } catch(Exception e) { db.rollback();throw e; }
        }
    }
}
